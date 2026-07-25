using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Dispatching;
using PeakLogicEdge.Core.Alarms;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.App.Services;

public sealed record RecentReadingRow(string ThingName, string ObservedAt, string MetricsSummary);

public sealed record AlertRow(long Id, string ThingName, string Severity, string Message, string RaisedAt);

// Owns the real ingestion -> normalization -> durable-caching pipeline --
// mirrors PeakLogicEdge.Host's Program.cs exactly (same
// SimulatedIngestionSource demo device, same TelemetryBus/
// IngestionOrchestrator/TelemetryCache), but drives UI-bound observable
// state instead of Console.WriteLine. This is the "built against the
// now-working data layer, not mocked separately" piece architecture doc
// S11.1's build sequence explicitly requires for the Kiosk UI step -- the
// App is a real consumer of Core, not a second implementation with fake
// data standing in for it.
//
// ObservableCollection/property-changed updates must happen on the UI
// thread in WinUI 3 -- everything that mutates observable state here goes
// through the DispatcherQueue captured at StartAsync time.
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

    private readonly ILogger _log;
    private readonly SiteIdentity _site;
    private readonly TelemetryBus _bus = new();
    private readonly IngestionOrchestrator _orchestrator;
    private readonly Dictionary<string, string> _thingNameByDeviceKey = new()
    {
        ["demo-chlorinator"] = "plg-demo-0001",
    };

    private DispatcherQueue? _dispatcher;
    private TelemetryCache? _cache;
    private LocalAlertStore? _alerts;
    private int _pendingCount;

    public EdgeRuntimeService(ILogger log, SiteIdentity site)
    {
        _log = log;
        _site = site;
        _orchestrator = new IngestionOrchestrator(log);

        // Demo-only device, standing in for real sensor hardware -- this
        // hub isn't wired to any real device yet (S2 "no real hardware
        // yet" disclosure, unchanged). Attributed to whatever site this
        // hub was commissioned for during Setup, not hardcoded to a
        // specific customer.
        _orchestrator.Register(new SimulatedIngestionSource(
            deviceKey: "demo-chlorinator",
            metrics: new Dictionary<string, (double Base, double Spread)>
            {
                ["temp_c"] = (27.8, 1.5),
                ["salt_ppm"] = (3200, 100),
                ["flow_lpm"] = (112, 8),
            },
            sink: _bus.Writer,
            log: log,
            interval: TimeSpan.FromSeconds(5)));
    }

    public string SiteDisplayName => _site.DisplayName;

    public ObservableCollection<RecentReadingRow> RecentReadings { get; } = new();

    public ObservableCollection<AlertRow> ActiveAlerts { get; } = new();

    public IReadOnlyDictionary<string, string> IngestionHealth => _orchestrator.Health;

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
        _cache = await TelemetryCache.OpenAsync(Path.Combine(cacheDir, "edge-cache.db"));
        _alerts = await LocalAlertStore.OpenAsync(Path.Combine(cacheDir, "edge-alerts.db"));

        await RefreshAlertsAsync();

        _ = _orchestrator.RunAsync(ct);
        _ = NormalizationLoopAsync(ct);
        _ = StatusPollLoopAsync(ct);
    }

    // Locally-cleared here means dismissed on THIS device only -- it does
    // not claim the alert was acknowledged in any cloud system, since none
    // is connected. A real cloud acknowledgment (PeakLogicApiClient.
    // AcknowledgeAlertAsync) is a separate, already-designed call this
    // method does not attempt to make.
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

    private async Task NormalizationLoopAsync(CancellationToken ct)
    {
        await foreach (var reading in _bus.Reader.ReadAllAsync(ct))
        {
            var thingName = _thingNameByDeviceKey.GetValueOrDefault(reading.SourceDeviceKey, reading.SourceDeviceKey);
            var envelope = new TelemetryEnvelope
            {
                ThingName = thingName,
                ObservedAt = reading.ObservedAt,
                Metrics = reading.Metrics,
            };
            await _cache!.EnqueueAsync(envelope.ThingName, envelope.ToWirePayload());

            var row = new RecentReadingRow(
                thingName,
                reading.ObservedAt.ToLocalTime().ToString("HH:mm:ss"),
                string.Join("  ", reading.Metrics.Select(kv => $"{kv.Key}={kv.Value:0.##}")));

            // Offline alarm evaluation via the real EdgeAlarmEvaluator (§7.6) --
            // the same gt/lt math the cloud uses (backend/ingest/rules.ts), so an
            // offline alarm matches what the cloud would raise. The RULE SET here
            // is still a clearly-labeled DEMO placeholder (DemoAlarmRules): the
            // authoritative rules live cloud-side and will be delivered/cached
            // like a PeakAssist bundle. What's real now is the evaluation path;
            // what's a stand-in is only the rule content, until rule delivery
            // exists. (Dedup of repeat firings is future work -- unchanged from
            // the previous inline check, which also raised each violating read.)
            foreach (var alarm in EdgeAlarmEvaluator.Evaluate(DemoAlarmRules, reading.Metrics))
            {
                await _alerts!.RaiseAsync(thingName, alarm.Rule.Severity, alarm.Message);
                await RefreshAlertsAsync();
            }

            _dispatcher?.TryEnqueue(() =>
            {
                RecentReadings.Insert(0, row);
                while (RecentReadings.Count > MaxRecentReadings)
                    RecentReadings.RemoveAt(RecentReadings.Count - 1);
            });
        }
    }

    // Ingestion health (a plain dictionary, not observable) and pending
    // count both change outside any single UI-triggered event -- polled on
    // an interval rather than pushed, same tradeoff Program.cs's console
    // status line already made (a 15s status line there, a faster poll
    // here since a live UI can afford to refresh more often than a log
    // line worth printing).
    private async Task StatusPollLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(2), ct); }
            catch (OperationCanceledException) { return; }

            var pending = await _cache!.PendingCountAsync();
            _dispatcher?.TryEnqueue(() =>
            {
                PendingCount = pending;
                OnPropertyChanged(nameof(IngestionHealth));
            });
        }
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
