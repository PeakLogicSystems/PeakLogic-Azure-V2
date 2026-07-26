using PeakLogicEdge.Core.Versioning;

namespace PeakLogicEdge.Core.DesiredState;

// The closed-loop desired-state reconciler — the mechanism that makes the
// Platform Control Center a control plane rather than a dashboard (§3.1):
// declare desired state, diff against reported state, produce the drift report +
// the plan to converge + a compliance verdict. Pure — no I/O. In production the
// desired state arrives via IoT Hub twin desired properties and the plan drives
// the on-device apply; here that is transport, added later (infra-gated). This
// generalizes PeakAssistSync from one artifact to a whole Release Channel bundle.
public static class DesiredStateReconciler
{
    public static ReconciliationResult Reconcile(
        DesiredStateBundle desired,
        ReportedState reported,
        IReadOnlyList<StateOverride>? overrides = null,
        DateTimeOffset? now = null)
    {
        var at = now ?? DateTimeOffset.UtcNow;
        var activeOverrides = (overrides ?? Array.Empty<StateOverride>())
            .Where(o => o.ExpiresAt > at)
            .Select(o => o.Component)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var drift = new List<DriftItem>();
        var plan = new List<DesiredComponent>();
        var desiredKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // 1. Every desired component: is the device InSync / Behind / Ahead / Missing?
        foreach (var c in desired.Components)
        {
            desiredKeys.Add(c.Component);
            var expected = activeOverrides.Contains(c.Component);
            reported.VersionsByComponent.TryGetValue(c.Component, out var reportedVersion);

            DriftStatus status;
            if (string.IsNullOrEmpty(reportedVersion))
            {
                status = DriftStatus.Missing;
            }
            else
            {
                var cmp = DottedVersion.Compare(reportedVersion, c.DesiredVersion);
                status = cmp == 0 ? DriftStatus.InSync : cmp < 0 ? DriftStatus.Behind : DriftStatus.Ahead;
            }

            drift.Add(new DriftItem(c.Component, c.Category, c.DesiredVersion, reportedVersion, status, expected));

            // Converge Behind/Missing toward desired — but never auto-downgrade
            // (Ahead is left for a deliberate rollback), and never touch a
            // component an active override says to leave alone.
            if (!expected && (status is DriftStatus.Behind or DriftStatus.Missing))
            {
                plan.Add(c);
            }
        }

        // 2. Unexpected drift: components the device reports that the channel does
        // not describe at all.
        foreach (var (component, version) in reported.VersionsByComponent)
        {
            if (desiredKeys.Contains(component)) continue;
            var expected = activeOverrides.Contains(component);
            drift.Add(new DriftItem(component, Category: null, DesiredVersion: null, version, DriftStatus.Unexpected, expected));
        }

        // Compliant iff every drift item is either already InSync or excused by an
        // active override. Behind / Missing / Ahead / Unexpected all break
        // compliance unless overridden — expected vs. unexpected drift (PCC §5).
        var compliant = drift.All(d => d.Status == DriftStatus.InSync || d.Expected);

        return new ReconciliationResult(desired.ChannelName, drift, plan, compliant);
    }
}
