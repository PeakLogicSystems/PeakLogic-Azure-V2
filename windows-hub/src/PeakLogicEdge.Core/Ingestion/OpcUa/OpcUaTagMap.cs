using System.Globalization;

namespace PeakLogicEdge.Core.Ingestion.OpcUa;

// OPC-UA acquisition model (hub-agent-runtime-design.md §7.5). An OPC-UA server
// exposes typed nodes; a tag point maps a canonical metric to a node id and a
// linear scale/offset (raw*scale+offset — same semantics as the cloud tags
// fabric and the Modbus source, so normalization is consistent across all
// acquisition paths). Unlike Modbus, the server returns already-typed values, so
// the only pure logic is node→metric mapping and coercing that value to double.

public sealed record OpcUaTagPoint(
    string Metric,     // canonical metric name
    string NodeId,     // OPC-UA node id, e.g. "ns=2;s=Chlorinator.Flow"
    double Scale = 1.0,
    double Offset = 0.0);

public sealed record OpcUaTagMap(IReadOnlyList<OpcUaTagPoint> Points)
{
    public IReadOnlyList<string> NodeIds => Points.Select(p => p.NodeId).ToList();
}

public static class OpcUaValueCoercion
{
    /// <summary>
    /// Coerce an OPC-UA node value to double. OPC servers return a range of CLR
    /// types (integer widths, float/double, bool, or a numeric string); all map
    /// to a telemetry double. A null or non-numeric value returns null — the
    /// caller skips that metric rather than emitting a bogus number.
    /// </summary>
    public static double? ToDouble(object? value)
    {
        switch (value)
        {
            case null:
                return null;
            case bool b:
                return b ? 1.0 : 0.0;
            case double d:
                return d;
            case float f:
                return f;
            case byte or sbyte or short or ushort or int or uint or long or ulong:
                return Convert.ToDouble(value, CultureInfo.InvariantCulture);
            case string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed):
                return parsed;
            default:
                return null;
        }
    }
}
