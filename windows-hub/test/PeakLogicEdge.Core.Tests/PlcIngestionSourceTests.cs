using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using PeakLogicEdge.Core.Ingestion.Modbus;
using PeakLogicEdge.Core.Ingestion.OpcUa;
using PeakLogicEdge.Core.Normalization;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// The Modbus/OPC-UA sources are IIngestionSources like any other — a poll cycle
// must decode/coerce + scale and write a RawReading to the shared bus, so the
// reading is indistinguishable downstream from a serial or REST source. Driven
// through PollOnceAsync (one cycle, no timers) against a fake transport reader.
public class PlcIngestionSourceTests
{
    [Fact]
    public async Task Modbus_PollOnce_ReadsBlock_DecodesScaled_AndEmits()
    {
        var channel = Channel.CreateUnbounded<RawReading>();
        var map = new ModbusRegisterMap(new[]
        {
            new ModbusTagPoint("flow_lpm", 40, ModbusDataType.UInt16, Scale: 0.1),
        });
        var reader = new FakeModbusReader(new ushort[] { 1120 });
        var source = new ModbusTcpIngestionSource("plc-1", map, reader, channel.Writer, NullLogger.Instance);

        await source.PollOnceAsync(CancellationToken.None);

        // Read the block bounds the source asked for come from the map.
        Assert.Equal((ushort)40, reader.LastStart);
        Assert.Equal((ushort)1, reader.LastCount);

        Assert.True(channel.Reader.TryRead(out var reading));
        Assert.Equal("plc-1", reading!.SourceDeviceKey);
        Assert.Equal(112.0, reading.Metrics["flow_lpm"], 3); // 1120 * 0.1
    }

    [Fact]
    public async Task OpcUa_PollOnce_CoercesScales_AndSkipsNonNumeric()
    {
        var channel = Channel.CreateUnbounded<RawReading>();
        var map = new OpcUaTagMap(new[]
        {
            new OpcUaTagPoint("temp_c", "ns=2;s=Temp", Scale: 0.1),
            new OpcUaTagPoint("pump_on", "ns=2;s=PumpRunning"),
            new OpcUaTagPoint("broken", "ns=2;s=Label"), // non-numeric -> skipped
        });
        var reader = new FakeOpcReader(new Dictionary<string, object?>
        {
            ["ns=2;s=Temp"] = (short)255,   // -> 25.5
            ["ns=2;s=PumpRunning"] = true,  // -> 1.0
            ["ns=2;s=Label"] = "Chlorinator",
        });
        var source = new OpcUaIngestionSource("opc-1", map, reader, channel.Writer, NullLogger.Instance);

        await source.PollOnceAsync(CancellationToken.None);

        Assert.True(channel.Reader.TryRead(out var reading));
        Assert.Equal(25.5, reading!.Metrics["temp_c"], 3);
        Assert.Equal(1.0, reading.Metrics["pump_on"]);
        Assert.False(reading.Metrics.ContainsKey("broken")); // non-numeric skipped, not zero
    }

    [Fact]
    public async Task OpcUa_PollOnce_EmitsNothingWhenNoNumericValues()
    {
        var channel = Channel.CreateUnbounded<RawReading>();
        var map = new OpcUaTagMap(new[] { new OpcUaTagPoint("x", "ns=2;s=X") });
        var reader = new FakeOpcReader(new Dictionary<string, object?> { ["ns=2;s=X"] = "not-a-number" });
        var source = new OpcUaIngestionSource("opc-1", map, reader, channel.Writer, NullLogger.Instance);

        await source.PollOnceAsync(CancellationToken.None);

        Assert.False(channel.Reader.TryRead(out _)); // no empty reading emitted
    }

    [Theory]
    [InlineData(true, 1.0)]
    [InlineData(false, 0.0)]
    public void OpcUaCoercion_Bool(bool input, double expected) =>
        Assert.Equal(expected, OpcUaValueCoercion.ToDouble(input));

    [Fact]
    public void OpcUaCoercion_NumericTypes_And_NonNumeric()
    {
        Assert.Equal(5.0, OpcUaValueCoercion.ToDouble((short)5));
        Assert.Equal(7.0, OpcUaValueCoercion.ToDouble(7L));
        Assert.Equal(2.5, OpcUaValueCoercion.ToDouble(2.5f)!.Value, 3);
        Assert.Equal(3.25, OpcUaValueCoercion.ToDouble("3.25"));
        Assert.Null(OpcUaValueCoercion.ToDouble(null));
        Assert.Null(OpcUaValueCoercion.ToDouble("abc"));
        Assert.Null(OpcUaValueCoercion.ToDouble(new object()));
    }
}

internal sealed class FakeModbusReader : IModbusRegisterReader
{
    private readonly ushort[] _block;
    public ushort LastStart { get; private set; }
    public ushort LastCount { get; private set; }

    public FakeModbusReader(ushort[] block) => _block = block;

    public Task<ushort[]> ReadRegistersAsync(ushort startAddress, ushort count, CancellationToken ct)
    {
        LastStart = startAddress;
        LastCount = count;
        return Task.FromResult(_block);
    }
}

internal sealed class FakeOpcReader : IOpcUaValueReader
{
    private readonly IReadOnlyDictionary<string, object?> _values;
    public FakeOpcReader(IReadOnlyDictionary<string, object?> values) => _values = values;

    public Task<IReadOnlyDictionary<string, object?>> ReadValuesAsync(IReadOnlyList<string> nodeIds, CancellationToken ct) =>
        Task.FromResult(_values);
}
