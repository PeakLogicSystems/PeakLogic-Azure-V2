namespace PeakLogicEdge.Core.Versioning;

// Compare dotted-numeric versions ("5.2.1", "2026.07.1", "22") component-wise,
// with the shorter zero-padded and a non-numeric component treated as 0.
// Returns -1 / 0 / 1 (a<b / a==b / a>b). Shared by PeakAssist content-sync and
// the desired-state reconciler so version ordering is defined in exactly one
// place, not re-derived per consumer.
public static class DottedVersion
{
    public static int Compare(string a, string b)
    {
        var pa = a.Split('.');
        var pb = b.Split('.');
        var len = Math.Max(pa.Length, pb.Length);
        for (var i = 0; i < len; i++)
        {
            var x = Parse(i < pa.Length ? pa[i] : "0");
            var y = Parse(i < pb.Length ? pb[i] : "0");
            if (x < y) return -1;
            if (x > y) return 1;
        }
        return 0;
    }

    private static int Parse(string s) => int.TryParse(s, out var n) ? n : 0;
}
