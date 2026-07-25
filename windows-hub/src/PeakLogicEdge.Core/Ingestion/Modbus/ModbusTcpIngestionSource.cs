using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion.Modbus;

// A Modbus TCP acquisition source (hub-agent-runtime-design.md §7.5). Polls a
// device's register block on an interval, decodes it to canonical metrics, and
// writes a RawReading to the same TelemetryBus every other source feeds —
// nothing downstream (normalization, durable cache, uplink) knows or cares that
// this reading came from a PLC rather than a serial sensor.
//
// The actual TCP wire (function-code 3/4 reads over a socket) sits behind
// IModbusRegisterReader. A real NModbus-backed reader is a thin adapter to add
// when there's a real PLC to test against — deferred exactly like the platform's
// standing "no real sensor hardware yet" disclosure, not faked here.
public sealed class ModbusTcpIngestionSource : IIngestionSource
{
    private readonly string _deviceKey;
    private readonly ModbusRegisterMap _map;
    private readonly IModbusRegisterReader _reader;
    private readonly ChannelWriter<RawReading> _sink;
    private readonly ILogger _log;
    private readonly TimeSpan _interval;

    public string DeviceKey => _deviceKey;

    public ModbusTcpIngestionSource(
        string deviceKey,
        ModbusRegisterMap map,
        IModbusRegisterReader reader,
        ChannelWriter<RawReading> sink,
        ILogger log,
        TimeSpan? interval = null)
    {
        _deviceKey = deviceKey;
        _map = map;
        _reader = reader;
        _sink = sink;
        _log = log;
        _interval = interval ?? TimeSpan.FromSeconds(5);
    }

    public async Task RunAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                await PollOnceAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // A single missed poll isn't durability-critical — the cache
                // guarantees delivery of what WAS read. A transient socket/read
                // fault is logged and retried on the next tick; a persistent one
                // that throws out of RunAsync is restarted with backoff by the
                // IngestionOrchestrator, same as every other source.
                _log.LogWarning(ex, "Modbus poll failed for {DeviceKey}", DeviceKey);
            }
        }
    }

    /// One read-decode-emit cycle. Public so it can be driven directly in tests
    /// (and by a single-shot bring-up harness) without timing games.
    public async Task PollOnceAsync(CancellationToken ct)
    {
        var block = await _reader.ReadRegistersAsync(_map.BaseAddress, _map.RegisterCount, ct);
        var metrics = ModbusDecoder.Decode(_map, block);
        var reading = new RawReading(DeviceKey, DateTimeOffset.UtcNow, metrics);
        if (!_sink.TryWrite(reading))
        {
            _log.LogWarning("Telemetry bus full — dropped a Modbus reading from {DeviceKey}", DeviceKey);
        }
    }
}
