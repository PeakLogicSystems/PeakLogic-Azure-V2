using PeakLogicEdge.Core.Ingestion.Modbus;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// Modbus register decoding is the error-prone core of a PLC driver: data-type
// reinterpretation, 32-bit word order (the classic "word swap" gotcha), and
// scaling. A wrong bit here silently reports garbage engineering values, so it
// gets exhaustive coverage — no PLC required.
public class ModbusDecoderTests
{
    private static double DecodeOne(ModbusTagPoint point, params ushort[] block)
    {
        var map = new ModbusRegisterMap(new[] { point });
        return map.Points.Count == 1
            ? ModbusDecoder.Decode(map, block)[point.Metric]
            : throw new InvalidOperationException();
    }

    [Fact]
    public void UInt16_And_Int16()
    {
        Assert.Equal(60000, DecodeOne(new ModbusTagPoint("m", 0, ModbusDataType.UInt16), 60000));
        // 0xFFFF as signed 16-bit is -1, not 65535.
        Assert.Equal(-1, DecodeOne(new ModbusTagPoint("m", 0, ModbusDataType.Int16), 0xFFFF));
    }

    [Fact]
    public void UInt32_WordOrders()
    {
        // 100000 = 0x000186A0 -> high word 0x0001, low word 0x86A0.
        Assert.Equal(100000, DecodeOne(
            new ModbusTagPoint("m", 0, ModbusDataType.UInt32, WordOrder: ModbusWordOrder.HighWordFirst),
            0x0001, 0x86A0));
        // Same value, registers swapped, decoded LowWordFirst.
        Assert.Equal(100000, DecodeOne(
            new ModbusTagPoint("m", 0, ModbusDataType.UInt32, WordOrder: ModbusWordOrder.LowWordFirst),
            0x86A0, 0x0001));
    }

    [Fact]
    public void Int32_Negative()
    {
        // -100000 = 0xFFFE7960 -> high 0xFFFE, low 0x7960.
        Assert.Equal(-100000, DecodeOne(
            new ModbusTagPoint("m", 0, ModbusDataType.Int32, WordOrder: ModbusWordOrder.HighWordFirst),
            0xFFFE, 0x7960));
    }

    [Fact]
    public void Float32_BothWordOrders()
    {
        // 25.5f = 0x41CC0000 -> high 0x41CC, low 0x0000.
        Assert.Equal(25.5, DecodeOne(
            new ModbusTagPoint("m", 0, ModbusDataType.Float32, WordOrder: ModbusWordOrder.HighWordFirst),
            0x41CC, 0x0000), 3);
        Assert.Equal(25.5, DecodeOne(
            new ModbusTagPoint("m", 0, ModbusDataType.Float32, WordOrder: ModbusWordOrder.LowWordFirst),
            0x0000, 0x41CC), 3);
    }

    [Fact]
    public void AppliesScaleAndOffset()
    {
        // raw 100 * 0.5 + (-10) = 40 (exactly-representable factors, exact assert).
        Assert.Equal(40.0, DecodeOne(
            new ModbusTagPoint("level", 0, ModbusDataType.UInt16, Scale: 0.5, Offset: -10.0), 100));
    }

    [Fact]
    public void DecodesMultiplePoints_IndexedFromBaseAddress()
    {
        // Points at absolute addresses 10 and 11 -> block is read from base 10.
        var map = new ModbusRegisterMap(new[]
        {
            new ModbusTagPoint("flow", 10, ModbusDataType.UInt16),
            new ModbusTagPoint("temp", 11, ModbusDataType.Int16, Scale: 0.1),
        });
        Assert.Equal((ushort)10, map.BaseAddress);
        Assert.Equal((ushort)2, map.RegisterCount);

        var metrics = ModbusDecoder.Decode(map, new ushort[] { 250, 0xFFFF }); // block[0]=addr10, block[1]=addr11
        Assert.Equal(250, metrics["flow"]);
        Assert.Equal(-0.1, metrics["temp"], 3); // (short)0xFFFF = -1, *0.1
    }

    [Fact]
    public void RejectsTooShortBlock()
    {
        var map = new ModbusRegisterMap(new[] { new ModbusTagPoint("m", 0, ModbusDataType.UInt32) }); // needs 2
        Assert.Throws<ArgumentException>(() => ModbusDecoder.Decode(map, new ushort[] { 0x0001 }));
    }
}
