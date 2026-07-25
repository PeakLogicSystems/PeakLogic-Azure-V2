using PeakLogicEdge.Core.Backend;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// The register-vs-defer commissioning decision (HubCommissioning.Plan) is the
// logic SetupPage routes through — extracted from the WinUI code-behind so it's
// testable without a UI. A wrong decision here would either silently skip cloud
// registration when it should happen, or attempt it with nothing to talk to.
public class HubCommissioningTests
{
    [Fact]
    public void Plan_NoBackend_DefersLocalOnly()
    {
        var plan = HubCommissioning.Plan(backendConfigured: false, credentialAvailable: false);
        Assert.Equal(CommissioningMode.DeferLocalOnly, plan.Mode);
        Assert.Contains("backend", plan.Reason, System.StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Plan_BackendButNoCredential_DefersLocalOnly()
    {
        // The backend exists but this hub has no seeded credential yet — it
        // cannot authenticate to the admin-gated POST /v1/hubs, so it defers.
        var plan = HubCommissioning.Plan(backendConfigured: true, credentialAvailable: false);
        Assert.Equal(CommissioningMode.DeferLocalOnly, plan.Mode);
        Assert.Contains("credential", plan.Reason, System.StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Plan_BackendAndCredential_RegistersWithCloud()
    {
        var plan = HubCommissioning.Plan(backendConfigured: true, credentialAvailable: true);
        Assert.Equal(CommissioningMode.RegisterWithCloud, plan.Mode);
    }
}
