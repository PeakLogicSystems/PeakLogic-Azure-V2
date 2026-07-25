namespace PeakLogicEdge.Core.PeakAssist;

// The hub's PeakAssist bundle-sync engine — the .NET half of
// backend/shared/peakassist-sync.ts. Transport-agnostic: it decides whether an
// offered bundle should be installed and verifies its integrity, regardless of
// how the bundle was signalled/fetched (per hub-enrollment-and-identity-design.md
// D2 the target version arrives via IoT Hub twin desired-properties). Pure — no
// I/O, no crypto dependency. The checksum is a byte-for-byte port of the TS
// contentChecksum and is proven equal to it by a cross-language golden test, so
// a bundle assembled in the cloud verifies on the hub.

public enum SyncOutcome
{
    /// The offered bundle is newer and its checksum verifies — install it.
    Install,

    /// The hub is already on this version (or newer) — nothing to do.
    UpToDate,

    /// The offered bundle failed checksum verification — reject; keep the good offline help.
    Rejected,
}

public sealed record SyncDecision(SyncOutcome Outcome, string Reason);

public static class PeakAssistSync
{
    // Field / record separators for the checksum serialization (ASCII US / RS —
    // never present in help text), identical to peakassist-seed.ts's FS/RS.
    private const char FS = (char)31;
    private const char RS = (char)30;

    /// <summary>
    /// The hub's decision for an offered bundle against its current version.
    /// Verify-before-install: a corrupted or truncated sync must never replace
    /// good offline help (PA-5).
    /// </summary>
    public static SyncDecision Evaluate(string? currentVersion, PeakAssistBundle bundle)
    {
        if (!NeedsBundleUpdate(currentVersion, bundle.Version))
        {
            return new SyncDecision(SyncOutcome.UpToDate,
                $"Hub already on '{currentVersion ?? "none"}'; offered '{bundle.Version}' is not newer.");
        }

        if (!VerifyBundle(bundle))
        {
            return new SyncDecision(SyncOutcome.Rejected,
                $"Bundle '{bundle.Version}' failed checksum verification — not installing; keeping current help.");
        }

        return new SyncDecision(SyncOutcome.Install,
            $"Installing PeakAssist bundle '{bundle.Version}' (was '{currentVersion ?? "none"}').");
    }

    /// <summary>Does the hub need this bundle? True if never synced or older than offered.</summary>
    public static bool NeedsBundleUpdate(string? hubVersion, string latestVersion)
    {
        if (string.IsNullOrEmpty(hubVersion)) return true;
        return CompareContentVersions(hubVersion, latestVersion) < 0;
    }

    /// <summary>
    /// Verify a bundle: recompute its content checksum and compare to the stamped
    /// value. Order- and id-independent (see ContentChecksum), so it holds
    /// regardless of wire serialization order.
    /// </summary>
    public static bool VerifyBundle(PeakAssistBundle bundle) =>
        ContentChecksum(bundle.Content, bundle.Version) == bundle.Checksum;

    /// <summary>
    /// Compare two 'YYYY.MM.N' versions numerically, component-wise, shorter
    /// zero-padded. Returns -1 / 0 / 1. Mirrors compareContentVersions in
    /// peakassist-sync.ts; a non-numeric component is treated as 0.
    /// </summary>
    public static int CompareContentVersions(string a, string b)
    {
        var pa = a.Split('.');
        var pb = b.Split('.');
        var len = Math.Max(pa.Length, pb.Length);
        for (var i = 0; i < len; i++)
        {
            var x = ParseComponent(i < pa.Length ? pa[i] : "0");
            var y = ParseComponent(i < pb.Length ? pb[i] : "0");
            if (x < y) return -1;
            if (x > y) return 1;
        }
        return 0;
    }

    private static int ParseComponent(string s) => int.TryParse(s, out var n) ? n : 0;

    /// <summary>
    /// Deterministic content checksum (FNV-1a) — a byte-for-byte port of
    /// peakassist-seed.ts's contentChecksum. Order- and id-independent: a hash of
    /// the content itself. Parity with the TS version is load-bearing (the cloud
    /// stamps the checksum, the hub verifies it) and is proven by a cross-language
    /// golden test. Porting details that make it exact: iteration over UTF-16 code
    /// units (C# char == JS charCodeAt), 32-bit wrapping multiply (unchecked uint
    /// == Math.imul), and ORDINAL sort (== JS default Array.sort by code unit).
    /// </summary>
    public static string ContentChecksum(IReadOnlyList<HelpContentItem> content, string version)
    {
        var lines = content
            .Select(c => string.Join(FS, new[] { c.HelpContextKey, c.Type, c.AlarmType ?? "", c.Title, c.Body }))
            .OrderBy(s => s, StringComparer.Ordinal);
        var serialized = version + "\n" + string.Join(RS, lines);

        uint h = 0x811c9dc5;
        foreach (var ch in serialized)
        {
            h ^= ch;
            h = unchecked(h * 0x01000193u);
        }
        return "fnv1a-" + h.ToString("x8");
    }
}
