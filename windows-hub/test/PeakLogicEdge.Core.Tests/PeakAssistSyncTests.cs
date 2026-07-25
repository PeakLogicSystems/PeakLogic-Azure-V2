using PeakLogicEdge.Core.PeakAssist;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// The hub's PeakAssist bundle-sync engine (the .NET half of
// backend/shared/peakassist-sync.ts). The checksum test is the load-bearing
// one: the cloud stamps a bundle's checksum with the TS contentChecksum and the
// hub must recompute the identical value or it would reject every good bundle.
public class PeakAssistSyncTests
{
    private static readonly HelpContentItem[] Corpus =
    {
        new("screen.dashboard", "screen_guide", "Dashboard", "The dashboard shows live values."),
        new("alarm.threshold", "alarm_explanation", "Threshold alarm", "A value crossed its limit.", AlarmType: "threshold"),
    };

    [Fact]
    public void ContentChecksum_MatchesTypeScriptGoldenValue()
    {
        // GOLDEN VALUE produced by the REAL backend/shared/peakassist-seed.ts
        // contentChecksum, run via esbuild+node over this exact corpus/version
        // (2026-07-25). If this fails, the .NET port has drifted from the TS
        // source of truth and the hub would reject cloud-stamped bundles.
        var checksum = PeakAssistSync.ContentChecksum(Corpus, "2026.07.1");
        Assert.Equal("fnv1a-e680b327", checksum);
    }

    [Fact]
    public void ContentChecksum_IsOrderIndependent()
    {
        // Order-independence is what lets the hash hold regardless of wire order
        // (or DB read order on the cloud side) — same guarantee as the TS version.
        var reversed = new[] { Corpus[1], Corpus[0] };
        Assert.Equal(
            PeakAssistSync.ContentChecksum(Corpus, "2026.07.1"),
            PeakAssistSync.ContentChecksum(reversed, "2026.07.1"));
    }

    [Fact]
    public void VerifyBundle_AcceptsMatching_RejectsTampered()
    {
        var good = new PeakAssistBundle("2026.07.1", PeakAssistSync.ContentChecksum(Corpus, "2026.07.1"), Corpus);
        Assert.True(PeakAssistSync.VerifyBundle(good));

        var tampered = good with { Checksum = "fnv1a-00000000" };
        Assert.False(PeakAssistSync.VerifyBundle(tampered));
    }

    [Theory]
    [InlineData("2026.07.1", "2026.07.2", -1)]
    [InlineData("2026.07.2", "2026.07.1", 1)]
    [InlineData("2026.07.1", "2026.07.1", 0)]
    [InlineData("2026.07", "2026.07.1", -1)]   // shorter is zero-padded
    [InlineData("2026.12.1", "2027.01.1", -1)] // year dominates
    public void CompareContentVersions_IsNumericComponentWise(string a, string b, int expected)
    {
        Assert.Equal(expected, PeakAssistSync.CompareContentVersions(a, b));
    }

    [Fact]
    public void NeedsBundleUpdate_TrueWhenNeverSyncedOrOlder()
    {
        Assert.True(PeakAssistSync.NeedsBundleUpdate(null, "2026.07.1"));   // never synced
        Assert.True(PeakAssistSync.NeedsBundleUpdate("2026.06.9", "2026.07.1"));
        Assert.False(PeakAssistSync.NeedsBundleUpdate("2026.07.1", "2026.07.1")); // equal
        Assert.False(PeakAssistSync.NeedsBundleUpdate("2026.08.1", "2026.07.1")); // defensively newer
    }

    [Fact]
    public void Evaluate_Install_UpToDate_Rejected()
    {
        var good = new PeakAssistBundle("2026.07.1", PeakAssistSync.ContentChecksum(Corpus, "2026.07.1"), Corpus);

        // Newer + valid checksum -> install.
        Assert.Equal(SyncOutcome.Install, PeakAssistSync.Evaluate(null, good).Outcome);
        Assert.Equal(SyncOutcome.Install, PeakAssistSync.Evaluate("2026.06.1", good).Outcome);

        // Already current -> nothing to do (checksum not even consulted).
        Assert.Equal(SyncOutcome.UpToDate, PeakAssistSync.Evaluate("2026.07.1", good).Outcome);

        // Newer but corrupted -> reject, keep current help.
        var tampered = good with { Checksum = "fnv1a-deadbeef" };
        Assert.Equal(SyncOutcome.Rejected, PeakAssistSync.Evaluate(null, tampered).Outcome);
    }
}
