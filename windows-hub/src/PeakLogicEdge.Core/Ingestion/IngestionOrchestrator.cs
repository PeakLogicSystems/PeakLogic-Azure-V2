using Microsoft.Extensions.Logging;

namespace PeakLogicEdge.Core.Ingestion;

// §2.2's closing note — "one IngestionOrchestrator that starts one task
// per configured device, restarts a crashed task (not the whole process),
// with the same backoff policy." A source's own RunAsync already retries
// its own transient failures (reconnect loops); this handles the outer
// case — RunAsync itself throwing and exiting entirely (a bug, an
// unexpected exception type) — so one broken device can't silently stop
// reporting forever without at least a bounded retry at this level too.
public sealed class IngestionOrchestrator
{
    private readonly List<IIngestionSource> _sources = new();
    private readonly ILogger _log;
    private readonly Dictionary<string, string> _health = new();

    public IngestionOrchestrator(ILogger log)
    {
        _log = log;
    }

    public void Register(IIngestionSource source) => _sources.Add(source);

    public IReadOnlyDictionary<string, string> Health => _health;

    public async Task RunAsync(CancellationToken ct)
    {
        var tasks = _sources.Select(source => RunWithRestartAsync(source, ct)).ToList();
        await Task.WhenAll(tasks);
    }

    private async Task RunWithRestartAsync(IIngestionSource source, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                _health[source.DeviceKey] = "running";
                await source.RunAsync(ct);
                // A source's RunAsync loop only returns when ct is cancelled
                // (each one's own while(!ct.IsCancellationRequested) loop) —
                // reaching here without cancellation means it exited
                // unexpectedly, handled by the catch below on the next
                // iteration's perspective... but since RunAsync completing
                // without throwing is itself unusual, log it either way.
                if (!ct.IsCancellationRequested)
                {
                    _log.LogWarning("Ingestion source {DeviceKey} exited without being cancelled — restarting", source.DeviceKey);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                _health[source.DeviceKey] = "stopped";
                return; // clean shutdown, not a crash
            }
            catch (Exception ex)
            {
                _health[source.DeviceKey] = "crashed";
                var delay = BackoffPolicy.NextDelay($"orchestrator:{source.DeviceKey}");
                _log.LogError(ex, "Ingestion source {DeviceKey} crashed — restarting in {Delay}", source.DeviceKey, delay);
                try { await Task.Delay(delay, ct); }
                catch (OperationCanceledException) { return; }
            }
        }
    }
}
