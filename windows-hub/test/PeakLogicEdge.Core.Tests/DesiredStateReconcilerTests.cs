using PeakLogicEdge.Core.DesiredState;
using PeakLogicEdge.Core.Versioning;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// The desired-state reconciler is the control-plane's defining mechanism
// (platform-control-center-architecture.md §3.1): desired vs. reported -> drift +
// plan + compliance. A wrong diff here either lets a drifted device pass as
// compliant, or churns updates for a device that is already converged.
public class DesiredStateReconcilerTests
{
    private static DesiredStateBundle Channel(params DesiredComponent[] components) =>
        new("Stable", components);

    private static ReportedState Reported(params (string Component, string Version)[] v) =>
        new(v.ToDictionary(x => x.Component, x => x.Version));

    private static readonly DesiredComponent Fw = new("firmware", DriftCategory.Firmware, "5.2.1");
    private static readonly DesiredComponent App = new("app", DriftCategory.Application, "12.5");

    [Fact]
    public void InSync_IsCompliant_WithEmptyPlan()
    {
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw, App),
            Reported(("firmware", "5.2.1"), ("app", "12.5")));

        Assert.True(r.Compliant);
        Assert.Empty(r.Plan);
        Assert.All(r.Drift, d => Assert.Equal(DriftStatus.InSync, d.Status));
    }

    [Fact]
    public void Behind_IsNonCompliant_AndPlanned()
    {
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw, App),
            Reported(("firmware", "5.1.9"), ("app", "12.5")));

        Assert.False(r.Compliant);
        var fw = r.Drift.Single(d => d.Component == "firmware");
        Assert.Equal(DriftStatus.Behind, fw.Status);
        Assert.Contains(r.Plan, p => p.Component == "firmware");
        Assert.DoesNotContain(r.Plan, p => p.Component == "app"); // app is in sync
    }

    [Fact]
    public void Missing_Component_IsPlanned_AndNonCompliant()
    {
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw, App),
            Reported(("firmware", "5.2.1"))); // app never installed

        Assert.False(r.Compliant);
        var app = r.Drift.Single(d => d.Component == "app");
        Assert.Equal(DriftStatus.Missing, app.Status);
        Assert.Null(app.ReportedVersion);
        Assert.Contains(r.Plan, p => p.Component == "app");
    }

    [Fact]
    public void Ahead_IsDrift_ButNotAutoDowngraded()
    {
        // Reported newer than desired (e.g. after the channel was rolled back).
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw),
            Reported(("firmware", "5.3.0")));

        Assert.False(r.Compliant);
        Assert.Equal(DriftStatus.Ahead, r.Drift.Single().Status);
        Assert.Empty(r.Plan); // never auto-downgrade firmware
    }

    [Fact]
    public void UnexpectedComponent_IsFlagged_NonCompliant_Uncategorized()
    {
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw),
            Reported(("firmware", "5.2.1"), ("rogue-driver", "9.9")));

        Assert.False(r.Compliant);
        var rogue = r.Drift.Single(d => d.Component == "rogue-driver");
        Assert.Equal(DriftStatus.Unexpected, rogue.Status);
        Assert.Null(rogue.Category); // not described by the channel
        Assert.Empty(r.Plan); // reconciler doesn't invent an update for an unknown component
    }

    [Fact]
    public void ActiveOverride_MakesDriftExpected_AndCompliant_AndUnplanned()
    {
        var future = DateTimeOffset.UtcNow.AddDays(7);
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw, App),
            Reported(("firmware", "5.1.0"), ("app", "12.5")),
            overrides: new[] { new StateOverride("firmware", future) });

        Assert.True(r.Compliant); // firmware drift is an approved exception
        var fw = r.Drift.Single(d => d.Component == "firmware");
        Assert.Equal(DriftStatus.Behind, fw.Status);
        Assert.True(fw.Expected);
        Assert.DoesNotContain(r.Plan, p => p.Component == "firmware"); // override => leave it alone
    }

    [Fact]
    public void ExpiredOverride_DoesNotExcuseDrift()
    {
        var past = DateTimeOffset.UtcNow.AddDays(-1);
        var r = DesiredStateReconciler.Reconcile(
            Channel(Fw),
            Reported(("firmware", "5.1.0")),
            overrides: new[] { new StateOverride("firmware", past) });

        Assert.False(r.Compliant); // expired -> back to unexpected drift
        Assert.False(r.Drift.Single().Expected);
        Assert.Contains(r.Plan, p => p.Component == "firmware");
    }

    [Fact]
    public void FullReleaseChannelBundle_MixedDrift()
    {
        // The spec's Stable channel example, with a device partway converged.
        var channel = Channel(
            new("firmware", DriftCategory.Firmware, "5.2.1"),
            new("bootloader", DriftCategory.Bootloader, "3.4"),
            new("drivers", DriftCategory.Driver, "8.1"),
            new("app", DriftCategory.Application, "12.5"),
            new("config", DriftCategory.Configuration, "22"),
            new("security", DriftCategory.Security, "7"),
            new("ai", DriftCategory.AiModel, "3.1"));

        var reported = Reported(
            ("firmware", "5.2.1"),   // in sync
            ("bootloader", "3.4"),   // in sync
            ("drivers", "8.0"),      // behind
            ("app", "12.5"),         // in sync
            ("config", "22"),        // in sync
            ("security", "6"),       // behind
            ("ai", "3.1"));          // in sync

        var r = DesiredStateReconciler.Reconcile(channel, reported);

        Assert.False(r.Compliant);
        Assert.Equal(2, r.Plan.Count);
        Assert.Contains(r.Plan, p => p.Component == "drivers");
        Assert.Contains(r.Plan, p => p.Component == "security");
        Assert.Equal(5, r.Drift.Count(d => d.Status == DriftStatus.InSync));
    }
}

// DottedVersion is now the single source of version ordering (shared by
// PeakAssist sync and the reconciler) — a couple of direct checks on it.
public class DottedVersionTests
{
    [Theory]
    [InlineData("5.2.1", "5.2.2", -1)]
    [InlineData("5.2.1", "5.2.1", 0)]
    [InlineData("5.3.0", "5.2.9", 1)]
    [InlineData("3.4", "3.4.0", 0)]   // shorter zero-padded
    [InlineData("22", "23", -1)]      // single-component versions
    public void Compare_IsNumericComponentWise(string a, string b, int expected) =>
        Assert.Equal(expected, DottedVersion.Compare(a, b));
}
