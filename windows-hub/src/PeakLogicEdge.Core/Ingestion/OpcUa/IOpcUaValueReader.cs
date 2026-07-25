namespace PeakLogicEdge.Core.Ingestion.OpcUa;

// The transport seam for OPC-UA. Isolates the session/subscription protocol
// (OPC-UA SDK, certificate trust, secure channel) from the map/coerce/emit
// logic, so that logic is testable without an OPC server and the concrete
// SDK-backed reader is a thin adapter added when there's a real server to test
// against. One call reads the current value of each requested node.
public interface IOpcUaValueReader
{
    /// <summary>
    /// Read the current value of each node in <paramref name="nodeIds"/>,
    /// returned as nodeId -> value (CLR-typed as the server exposes it; a node
    /// that could not be read is absent or maps to null). May throw on a session
    /// fault — the caller treats that as a missed poll and retries.
    /// </summary>
    Task<IReadOnlyDictionary<string, object?>> ReadValuesAsync(IReadOnlyList<string> nodeIds, CancellationToken ct);
}
