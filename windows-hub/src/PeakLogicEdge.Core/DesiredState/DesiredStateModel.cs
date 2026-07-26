namespace PeakLogicEdge.Core.DesiredState;

// The desired-state domain — the device-side model behind the Platform Control
// Center's closed-loop reconciler (platform-control-center-architecture.md §3.1).
// A Release Channel declares a complete desired software state (firmware,
// bootloader, drivers, app, config, security policy, AI model, help content);
// the device reports what it actually runs; the reconciler diffs the two into
// categorized drift + a convergence plan + a compliance verdict. This is the
// general form of PeakAssist's single-artifact sync — same idea, every component.

/// The drift taxonomy the PCC reports on (§2/§5). Version-based components only;
/// hardware drift is a separate, non-version concern not modeled here.
public enum DriftCategory
{
    Firmware, Bootloader, Driver, Application, Configuration, Security, Certificate, AiModel, HelpContent,
}

/// One component of a desired-state bundle: the version (and optional integrity
/// checksum) the Release Channel says this device SHOULD run.
public sealed record DesiredComponent(
    string Component,          // stable key, e.g. "firmware", "app", "peakassist"
    DriftCategory Category,
    string DesiredVersion,     // dotted-numeric, e.g. "5.2.1"
    string? Checksum = null);

/// A complete desired software state = the Release Channel bundle projected onto
/// a device (delivered via IoT Hub twin desired properties in production).
public sealed record DesiredStateBundle(string ChannelName, IReadOnlyList<DesiredComponent> Components);

/// What the device currently reports running, per component (twin reported props).
public sealed record ReportedState(IReadOnlyDictionary<string, string> VersionsByComponent);

/// An approved deviation (PCC §6). While active, it makes a component's drift
/// EXPECTED rather than a compliance violation. Expired overrides don't count.
public sealed record StateOverride(string Component, DateTimeOffset ExpiresAt);

/// Per-component reconciliation outcome.
public enum DriftStatus
{
    InSync,      // reported == desired
    Behind,      // reported older than desired -> needs update (convergence work)
    Ahead,       // reported newer than desired (post-channel-rollback / manual) — not auto-downgraded
    Missing,     // desired component not reported at all (never installed)
    Unexpected,  // reported a component that is NOT in the desired set (unexpected drift)
}

/// One line of the drift report. <see cref="Expected"/> = covered by an active
/// override (so it does not count against compliance). <see cref="Category"/> is
/// null for an Unexpected component the desired state does not describe.
public sealed record DriftItem(
    string Component,
    DriftCategory? Category,
    string? DesiredVersion,
    string? ReportedVersion,
    DriftStatus Status,
    bool Expected);

/// The reconciliation result: the full drift report, the convergence plan (what
/// to bring to desired, in the channel's declared order), and the compliance
/// verdict (no unexpected — i.e. non-overridden — deviation).
public sealed record ReconciliationResult(
    string ChannelName,
    IReadOnlyList<DriftItem> Drift,
    IReadOnlyList<DesiredComponent> Plan,
    bool Compliant);
