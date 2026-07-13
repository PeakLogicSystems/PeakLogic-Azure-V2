using System.IO.Ports;
using System.Runtime.Versioning;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion;

// §2.2 — one long-running background task per physical COM port. Windows
// can re-enumerate a USB-serial adapter on a different COM number across
// reconnects, so ComPortHint is treated as a starting guess, re-resolved
// via WMI on each retry rather than trusted to stay fixed — see
// ResolveComPort below. Not yet implemented in this first pass (real gap,
// disclosed): falls back to the configured hint only. Real VID/PID-based
// resolution needs System.Management (WMI), added when a real device is
// on hand to test resolution against.
[SupportedOSPlatform("windows")]
public sealed class SerialIngestionSource : IIngestionSource
{
    private readonly DeviceConfig _config;
    private readonly IProtocolParser _parser;
    private readonly ChannelWriter<RawReading> _sink;
    private readonly ILogger _log;

    public string DeviceKey => _config.DeviceKey;

    public SerialIngestionSource(DeviceConfig config, IProtocolParser parser, ChannelWriter<RawReading> sink, ILogger log)
    {
        _config = config;
        _parser = parser;
        _sink = sink;
        _log = log;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        var comPort = _config.Transport.ComPortHint
            ?? throw new InvalidOperationException($"Device '{DeviceKey}' has a serial transport with no comPortHint configured.");
        var baudRate = _config.Transport.BaudRate;

        while (!ct.IsCancellationRequested)
        {
            using var port = new SerialPort(comPort, baudRate, Parity.None, 8, StopBits.One)
            {
                ReadTimeout = 5000,
                WriteTimeout = 2000,
            };

            try
            {
                port.Open();
                _log.LogInformation("Serial {Port} opened for {DeviceKey}", comPort, DeviceKey);
                BackoffPolicy.Reset(DeviceKey);

                var buffer = new byte[4096];
                while (!ct.IsCancellationRequested)
                {
                    int n;
                    try
                    {
                        n = await Task.Run(() => port.Read(buffer, 0, buffer.Length), ct);
                    }
                    catch (TimeoutException)
                    {
                        continue; // no data this read cycle — normal, not an error
                    }

                    if (n <= 0) continue;

                    foreach (var reading in _parser.TryParseFrames(buffer.AsSpan(0, n)))
                    {
                        if (!_sink.TryWrite(reading))
                        {
                            _log.LogWarning("Telemetry bus full — dropped a frame from {DeviceKey}", DeviceKey);
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException)
            {
                var delay = BackoffPolicy.NextDelay(DeviceKey);
                _log.LogWarning(ex, "Serial {Port} failed for {DeviceKey} — retrying in {Delay}", comPort, DeviceKey, delay);
                await Task.Delay(delay, ct); // OperationCanceledException propagates naturally on shutdown — desired
            }
        }
    }
}
