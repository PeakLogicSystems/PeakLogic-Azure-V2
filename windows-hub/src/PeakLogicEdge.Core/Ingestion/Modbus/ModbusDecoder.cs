namespace PeakLogicEdge.Core.Ingestion.Modbus;

// Pure Modbus register decoding — the error-prone heart of a Modbus driver
// (data-type reinterpretation + word order + scaling), fully testable without a
// PLC. Given a raw register block (as the transport returns it: one ushort per
// 16-bit register, in Modbus big-endian numeric form) it produces canonical,
// engineering-unit metrics. No I/O.
public static class ModbusDecoder
{
    /// <summary>
    /// Decode every tag point in <paramref name="map"/> out of a register block
    /// read starting at <see cref="ModbusRegisterMap.BaseAddress"/>. Returns
    /// canonical metric name -> engineering value (raw*scale+offset).
    /// </summary>
    public static IReadOnlyDictionary<string, double> Decode(ModbusRegisterMap map, ushort[] block)
    {
        if (block.Length < map.RegisterCount)
        {
            throw new ArgumentException(
                $"Register block too short: need {map.RegisterCount} registers from base {map.BaseAddress}, got {block.Length}.",
                nameof(block));
        }

        var metrics = new Dictionary<string, double>(map.Points.Count);
        foreach (var point in map.Points)
        {
            var idx = point.Address - map.BaseAddress;
            metrics[point.Metric] = DecodePoint(point, block, idx) * point.Scale + point.Offset;
        }
        return metrics;
    }

    /// Decode a single point's RAW numeric value (before scale/offset).
    public static double DecodePoint(ModbusTagPoint point, ushort[] block, int index)
    {
        switch (point.Type)
        {
            case ModbusDataType.UInt16:
                return block[index];
            case ModbusDataType.Int16:
                return unchecked((short)block[index]);
            case ModbusDataType.Int32:
            case ModbusDataType.UInt32:
            case ModbusDataType.Float32:
                var combined = CombineWords(block[index], block[index + 1], point.WordOrder);
                return point.Type switch
                {
                    ModbusDataType.UInt32 => combined,
                    ModbusDataType.Int32 => unchecked((int)combined),
                    ModbusDataType.Float32 => BitConverter.Int32BitsToSingle(unchecked((int)combined)),
                    _ => throw new InvalidOperationException(), // unreachable
                };
            default:
                throw new ArgumentOutOfRangeException(nameof(point), point.Type, "Unknown Modbus data type.");
        }
    }

    private static uint CombineWords(ushort first, ushort second, ModbusWordOrder order)
    {
        var (high, low) = order == ModbusWordOrder.HighWordFirst ? (first, second) : (second, first);
        return ((uint)high << 16) | low;
    }
}
