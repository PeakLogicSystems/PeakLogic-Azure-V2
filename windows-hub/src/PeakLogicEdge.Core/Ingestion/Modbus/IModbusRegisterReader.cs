namespace PeakLogicEdge.Core.Ingestion.Modbus;

// The transport seam for Modbus TCP. Isolates the socket + function-code wire
// protocol (holding/input register reads) from the decode/normalize/emit logic,
// so that logic is testable without a PLC and the concrete NModbus-backed reader
// can be dropped in later as a thin adapter. One call reads a contiguous block;
// ModbusRegisterMap computes the block bounds.
public interface IModbusRegisterReader
{
    /// <summary>
    /// Read <paramref name="count"/> registers starting at
    /// <paramref name="startAddress"/>, returned as one ushort per register in
    /// Modbus big-endian numeric form. May throw on a transport fault — the
    /// caller treats that as a missed poll and retries.
    /// </summary>
    Task<ushort[]> ReadRegistersAsync(ushort startAddress, ushort count, CancellationToken ct);
}
