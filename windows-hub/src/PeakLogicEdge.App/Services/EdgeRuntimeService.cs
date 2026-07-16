using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Dispatching;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.App.Services;

public sealed record RecentReadingRow(string ThingName, string ObservedAt, string MetricsSummary);

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

    private readonly ILogger _log;
    private readonly TelemetryBus _bus = new();
    private readonly IngestionOrchestrator _orchestrator;
    private readonly Dictionary<string, string> _thingNameByDeviceKey = new()
    {
        ["demo-chlorinator"] = "plg-demo-0001",
    };

    private DispatcherQueue? _dispatcher;
    private TelemetryCache? _cache;
    private int _pendingCount;

    public EdgeRuntimeService(ILogger log)
    {
        _log = log;
        _orchestrator = new IngestionOrchestrator(log);
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

    public ObservableCollection<RecentReadingRow> RecentReadings { get; } = new();

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

        _ = _orchestrator.RunAsync(ct);
        _ = NormalizationLoopAsync(ct);
        _ = StatusPollLoopAsync(ct);
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
