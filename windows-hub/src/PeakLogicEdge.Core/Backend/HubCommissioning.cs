namespace PeakLogicEdge.Core.Backend;

// The commissioning decision, extracted from the WinUI code-behind so it is
// unit-testable and not buried in an event handler. A first-run hub can only
// register itself with the cloud (PeakLogicApiClient.RegisterHubAsync ->
// POST /v1/hubs) when it actually has somewhere to register TO — a backend
// base URL — and something to authenticate WITH — a seeded operator/admin
// credential. Absent either, commissioning saves the site details locally and
// defers registration. That deferral is the honest behavior today: the Azure
// backend isn't deployed yet, and first-run authentication is still an open
// design question (hub-agent-runtime-design.md §8 Q6/Q7). This type models the
// decision only; it performs no I/O and makes no network call.

public enum CommissioningMode
{
    /// Backend + credential present — register this hub with PeakLogicSystems now.
    RegisterWithCloud,

    /// No backend URL and/or no credential — save locally, defer cloud registration.
    DeferLocalOnly,
}

public sealed record CommissioningPlan(CommissioningMode Mode, string Reason);

public static class HubCommissioning
{
    public static CommissioningPlan Plan(bool backendConfigured, bool credentialAvailable)
    {
        if (!backendConfigured)
        {
            return new CommissioningPlan(
                CommissioningMode.DeferLocalOnly,
                "No backend is configured for this hub yet — saving site details locally and deferring cloud registration.");
        }

        if (!credentialAvailable)
        {
            return new CommissioningPlan(
                CommissioningMode.DeferLocalOnly,
                "No operator credential is available for this hub yet — saving site details locally and deferring cloud registration.");
        }

        return new CommissioningPlan(
            CommissioningMode.RegisterWithCloud,
            "Backend and credential present — registering this hub with PeakLogic's cloud platform.");
    }
}
