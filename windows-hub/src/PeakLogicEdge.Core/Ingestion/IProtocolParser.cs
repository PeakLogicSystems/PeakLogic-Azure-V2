using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion;

public interface IProtocolParser
{
    // Called with whatever bytes were just read off the wire — a parser
    // owns its own internal buffering for partial frames across calls
    // (e.g. a line-based parser holding an incomplete line until the next
    // chunk brings the newline). Returns zero or more complete readings.
    IEnumerable<RawReading> TryParseFrames(ReadOnlySpan<byte> data);
}

// A pragmatic default: newline-delimited JSON, one reading per line — the
// common shape for simple serial sensors that just emit a JSON object per
// sample (as opposed to a binary protocol like Modbus RTU, which would get
// its own IProtocolParser implementation per device family). Buffers a
// partial trailing line across calls so a line split across two reads
// isn't silently dropped.
public sealed class NdjsonLineParser : IProtocolParser
{
    private readonly IPayloadMapper _mapper;
    private readonly string _deviceKey;
    private string _partialLine = string.Empty;

    public NdjsonLineParser(string deviceKey, IPayloadMapper mapper)
    {
        _deviceKey = deviceKey;
        _mapper = mapper;
    }

    public IEnumerable<RawReading> TryParseFrames(ReadOnlySpan<byte> data)
    {
        // Built eagerly into a List, not a `yield return` iterator — a
        // ReadOnlySpan<byte> parameter can't be used on a method containing
        // `yield return` (CS4007: a Span can't be captured in the compiler-
        // generated iterator state machine, since it's a ref struct). This
        // parsing is already fully synchronous, cheap work, so eager
        // evaluation costs nothing real here.
        var results = new List<RawReading>();

        var text = _partialLine + System.Text.Encoding.UTF8.GetString(data);
        var lines = text.Split('\n');

        // The last split segment is either empty (input ended cleanly on a
        // newline) or a genuinely incomplete line — carry it forward
        // either way rather than trying to parse a partial JSON object.
        _partialLine = lines[^1];

        for (var i = 0; i < lines.Length - 1; i++)
        {
            var line = lines[i].Trim();
            if (line.Length == 0) continue;

            try
            {
                results.Add(_mapper.Map(_deviceKey, line));
            }
            catch (System.Text.Json.JsonException)
            {
                // Malformed line — skip it, not fatal to the stream. A
                // sensor emitting occasional garbage on a noisy serial
                // line shouldn't take down ingestion for one bad frame.
            }
        }

        return results;
    }
}
