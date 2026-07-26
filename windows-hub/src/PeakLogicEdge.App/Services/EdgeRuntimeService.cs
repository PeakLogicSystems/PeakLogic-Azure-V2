using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Dispatching;
using PeakLogicEdge.Core.Agent;
using PeakLogicEdge.Core.Alarms;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Ingestion;

namespace PeakLogicEdge.App.Services;

public sealed record RecentReadingRow(string ThingName, string ObservedAt, string MetricsSummary);

public sealed record AlertRow(long Id, string ThingName, string Severity, string Message, string RaisedAt);

// The kiosk's projection of the shared, portable HubAgent (Core) into WinUI-
// bound observable state. It no longer owns a second copy of the ingestion ->
// normalization -> durable-caching pipeline (that lived here AND in the Host
// harness AND in PeakLogicEdge.Agent) — it constructs a HubAgent and subscribes
// to its OnReadingQueued / OnStatus hooks, doing only the UI-specific work here:
// observable collections, offline alarm evaluation, and the local alert store.
// The App is a real consumer of the exact same agent the headless services run.
//
// ObservableCollection/property-changed updates must happen on the UI thread in
// WinUI 3 — everything that mutates observable state goes through the
// DispatcherQueue captured at StartAsync time.
public sealed class EdgeRuntimeService : INotifyPropertyChanged
{
    private const int MaxRecentReadings = 25;

    // DEMO placeholder rule set, fed through the real EdgeAlarmEvaluator until
    // authoritative rules are delivered from the cloud (§7.6). Same salt_ppm
    // band the previous inline check used, now expressed as real rules — the
    // evaluation is real; only the rule content is a stand-in.
    private static readonly IReadOnlyList<EdgeAlarmRule> DemoAlarmRules = new[]
    {
        new EdgeAlarmRule("salt_ppm", AlarmCondition.GreaterThan, 3400, "warning", "Salt (demo rule)"),
        new EdgeAlarmRule("salt_ppm", AlarmCondition.LessThan, 2700, "warning", "Salt (demo rule)"),
    };

    private readonly SiteIdentity _site;
    private readonly HubAgent _agent;

    private DispatcherQueue? _dispatcher;
    private LocalAlertStore? _alerts;
    private int _pendingCount;

    public EdgeRuntimeService(ILogger log, SiteIdentity site)
    {
        _site = site;

        // The SAME shared agent the headless PeakLogicEdge.Agent runs — the demo
        // device stands in for real hardware (unchanged disclosure), attributed
        // to this hub's commissioned site. UI state is driven by the hooks below,
        // not by a re-implemented pipeline.
        _agent = new HubAgent(
            sourceFactory: writer => new IIngestionSource[]
            {
                new SimulatedIngestionSource(
                    deviceKey: "demo-chlorinator",
                    metrics: new Dictionary<string, (double Base, double Spread)>
                    {
                        ["temp_c"] = (27.8, 1.5),
                        ["salt_ppm"] = (3200, 100),
                        ["flow_lpm"] = (112, 8),
                    },
                    sink: writer,
                    log: log,
                    interval: TimeSpan.FromSeconds(5)),
            },
            options: new HubAgentOptions
            {
                ThingNameByDeviceKey = new Dictionary<string, string> { ["demo-chlorinator"] = "plg-demo-0001" },
                StatusInterval = TimeSpan.FromSeconds(2), // a live UI can afford a faster status cadence than a log line
            },
            log: log)
        {
            OnReadingQueued = HandleReadingQueuedAsync,
            OnStatus = HandleStatusAsync,
        };
    }

    public string SiteDisplayName => _site.DisplayName;

    public ObservableCollection<RecentReadingRow> RecentReadings { get; } = new();

    public ObservableCollection<AlertRow> ActiveAlerts { get; } = new();

    public IReadOnlyDictionary<string, string> IngestionHealth => _agent.IngestionHealth;

    public int PendingCount
    {
        get => _pendingCount;
        private set
        {
            if (_pendingCount == value) return;
            _pendingCount = value;
            OnPropertyChanged();
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public async Task StartAsync(DispatcherQueue dispatcher, CancellationToken ct)
    {
        _dispatcher = dispatcher;

        var cacheDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PeakLogicEdge");
        Directory.CreateDirectory(cacheDir);
        // The local alert store is UI/alarm state, owned here — separate from the
        // telemetry durable queue, which the shared HubAgent owns.
        _alerts = await LocalAlertStore.OpenAsync(Path.Combine(cacheDir, "edge-alerts.db"));

        await RefreshAlertsAsync();

        _ = _agent.RunAsync(ct);
    }

    // Called by HubAgent after each reading is durably queued — the UI-specific
    // projection: recent-readings list + offline alarm evaluation.
    private async Task HandleReadingQueuedAsync(HubReadingEvent evt, CancellationToken ct)
    {
        var reading = evt.Reading;
        var row = new RecentReadingRow(
            evt.ThingName,
            reading.ObservedAt.ToLocalTime().ToString("HH:mm:ss"),
            string.Join("  ", reading.Metrics.Select(kv => $"{kv.Key}={kv.Value:0.##}")));

        // Offline alarm evaluation via the real EdgeAlarmEvaluator (§7.6) — same
        // gt/lt math the cloud uses, so an offline alarm matches what the cloud
        // would raise. The rule SET is still a labeled DEMO stand-in until cloud
        // rule delivery exists. (Repeat-firing dedup is future work.)
        if (_alerts is not null)
        {
            foreach (var alarm in EdgeAlarmEvaluator.Evaluate(DemoAlarmRules, reading.Metrics))
            {
                await _alerts.RaiseAsync(evt.ThingName, alarm.Rule.Severity, alarm.Message);
                await RefreshAlertsAsync();
            }
        }

        _dispatcher?.TryEnqueue(() =>
        {
            RecentReadings.Insert(0, row);
            while (RecentReadings.Count > MaxRecentReadings)
                RecentReadings.RemoveAt(RecentReadings.Count - 1);
        });
    }

    // Called by HubAgent each status tick with the durable-queue depth.
    private Task HandleStatusAsync(long pending, CancellationToken ct)
    {
        _dispatcher?.TryEnqueue(() =>
        {
            PendingCount = (int)pending;
            OnPropertyChanged(nameof(IngestionHealth));
        });
        return Task.CompletedTask;
    }

    // Locally-cleared here means dismissed on THIS device only -- it does not
    // claim the alert was acknowledged in any cloud system, since none is
    // connected. A real cloud acknowledgment (PeakLogicApiClient.
    // AcknowledgeAlertAsync) is a separate, already-designed call this method
    // does not attempt to make.
    public async Task ClearAlertAsync(long id)
    {
        if (_alerts is null) return;
        await _alerts.ClearAsync(id);
        await RefreshAlertsAsync();
    }

    private async Task RefreshAlertsAsync()
    {
        if (_alerts is null) return;
        var rows = await _alerts.ListActiveAsync();
        var mapped = rows.Select(a => new AlertRow(
            a.Id, a.ThingName, a.Severity, a.Message,
            DateTimeOffset.FromUnixTimeSeconds(a.RaisedAtUnix).ToLocalTime().ToString("HH:mm:ss"))).ToList();

        _dispatcher?.TryEnqueue(() =>
        {
            ActiveAlerts.Clear();
            foreach (var row in mapped) ActiveAlerts.Add(row);
        });
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
