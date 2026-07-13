using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion;

// §2.3 — the common case for LAN devices with a simple query API (a local
// BMS controller, a chlorinator's local status endpoint, etc.).
public sealed class RestPollIngestionSource : IIngestionSource
{
    private readonly DeviceConfig _config;
    private readonly IPayloadMapper _mapper;
    private readonly HttpClient _http;
    private readonly ChannelWriter<RawReading> _sink;
    private readonly ILogger _log;

    public string DeviceKey => _config.DeviceKey;

    public RestPollIngestionSource(DeviceConfig config, IPayloadMapper mapper, HttpClient http, ChannelWriter<RawReading> sink, ILogger log)
    {
        _config = config;
        _mapper = mapper;
        _http = http;
        _sink = sink;
        _log = log;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        var uri = _config.Transport.Uri
            ?? throw new InvalidOperationException($"Device '{DeviceKey}' has a restPoll transport with no uri configured.");
        var interval = TimeSpan.FromSeconds(Math.Max(_config.Transport.IntervalSeconds, 1));

        using var timer = new PeriodicTimer(interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                using var response = await _http.GetAsync(uri, ct);
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync(ct);
                var reading = _mapper.Map(DeviceKey, json);
                if (!_sink.TryWrite(reading))
                {
                    _log.LogWarning("Telemetry bus full — dropped a poll result from {DeviceKey}", DeviceKey);
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                // A single missed poll is not durability-critical here — it's
                // the Caching layer that guarantees delivery of what WAS
                // read; a poll that never happened has nothing to deliver.
                _log.LogWarning(ex, "Poll failed for {DeviceKey}", DeviceKey);
            }
        }
    }
}
