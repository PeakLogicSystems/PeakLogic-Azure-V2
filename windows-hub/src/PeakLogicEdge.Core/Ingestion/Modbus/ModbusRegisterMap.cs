namespace PeakLogicEdge.Core.Ingestion.Modbus;

// Modbus TCP acquisition model (hub-agent-runtime-design.md §7.5 — PLC/RTU
// sources). A Modbus device exposes 16-bit registers; a tag point maps a
// canonical metric to a register address, a data type, and a linear
// scale/offset applied to get engineering units. The scale/offset semantics
// (raw*scale+offset) mirror the cloud Telemetry Normalization Fabric
// (backend/shared/normalization.ts applyTag), so a value normalized on the hub
// matches what the cloud would compute — the dual-source parity PeakView360
// §3.1 depends on.

/// Register data types. 16-bit types span one register; 32-bit types span two.
public enum ModbusDataType { Int16, UInt16, Int32, UInt32, Float32 }

/// Word order for 32-bit values spanning two registers — the classic Modbus
/// integration gotcha. HighWordFirst = ABCD (most significant register first);
/// LowWordFirst = CDAB (word-swapped). Byte order within a register is the
/// standard Modbus big-endian, handled by the transport returning ushorts.
public enum ModbusWordOrder { HighWordFirst, LowWordFirst }

public sealed record ModbusTagPoint(
    string Metric,            // canonical metric name, e.g. "flow_lpm"
    ushort Address,           // absolute register address
    ModbusDataType Type,
    double Scale = 1.0,
    double Offset = 0.0,
    ModbusWordOrder WordOrder = ModbusWordOrder.HighWordFirst);

/// A device's register map — the set of tag points a poll reads. Exposes the
/// contiguous [BaseAddress, RegisterCount] span so a driver can batch-read the
/// whole block in one request, then decode each point out of it.
public sealed record ModbusRegisterMap(IReadOnlyList<ModbusTagPoint> Points)
{
    /// Registers spanned by a value of this type (1 for 16-bit, 2 for 32-bit).
    public static int RegisterWidth(ModbusDataType type) =>
        type is ModbusDataType.Int32 or ModbusDataType.UInt32 or ModbusDataType.Float32 ? 2 : 1;

    public ushort BaseAddress => Require().Min(p => p.Address);

    public ushort RegisterCount =>
        (ushort)(Require().Max(p => p.Address + RegisterWidth(p.Type)) - BaseAddress);

    private IReadOnlyList<ModbusTagPoint> Require() =>
        Points.Count > 0 ? Points : throw new InvalidOperationException("A Modbus register map needs at least one tag point.");
}
