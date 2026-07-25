using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using PeakLogicEdge.Core.Backend;
using PeakLogicEdge.Core.Configuration;

namespace PeakLogicEdge.App.Views;

public sealed partial class SetupPage : Page
{
    private string _configPath = string.Empty;

    public SetupPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        _configPath = (string)e.Parameter;
    }

    // The hub-registration API contract now EXISTS and is tested
    // (POST /v1/hubs -> backend/api/routes/hubs.ts; PeakLogicApiClient.
    // RegisterHubAsync speaks it). Commissioning routes through the real
    // decision (HubCommissioning.Plan) rather than a permanent stub. Today it
    // still resolves to DeferLocalOnly: no Azure backend is deployed and this
    // first-run form carries no backend URL or seeded credential — and a bare
    // hub has no admin token to call the admin-gated endpoint, nor a real
    // site FK to register against (only a display name). Those two gates are
    // the remaining open work (hub-agent-runtime-design.md §8 Q6 first-run
    // auth / Q7 site resolution). When provisioning supplies a backend URL +
    // operator credential, the RegisterWithCloud branch below calls
    // RegisterHubAsync and persists the returned id into SiteIdentity.HubId —
    // we do NOT fake a successful cloud registration against a backend that
    // isn't there.
    private async void RegisterButton_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        var siteName = SiteNameBox.Text.Trim();
        var tenantCode = TenantCodeBox.Text.Trim();

        if (siteName.Length == 0 || tenantCode.Length == 0)
        {
            StatusBar.Severity = InfoBarSeverity.Error;
            StatusBar.Title = "Missing information";
            StatusBar.Message = "Enter both a site name and a tenant/claim code before registering.";
            StatusBar.IsOpen = true;
            return;
        }

        RegisterButton.IsEnabled = false;

        var backend = new BackendConfig(
            ApiBaseUrl: string.Empty,
            CognitoClientId: string.Empty,
            CognitoAuthDomain: string.Empty,
            IotEndpoint: string.Empty);

        // A backend is "configured" only once provisioning has written a real
        // API base URL; a credential is available only once one has been
        // seeded (BackendAuthClient.SeedRefreshTokenAsync). Neither is true for
        // a first-run form today, so the plan resolves to DeferLocalOnly.
        var plan = HubCommissioning.Plan(
            backendConfigured: !string.IsNullOrEmpty(backend.ApiBaseUrl),
            credentialAvailable: false);

        StatusBar.Severity = InfoBarSeverity.Informational;
        StatusBar.Title = plan.Mode == CommissioningMode.RegisterWithCloud ? "Registering hub" : "Saving locally";
        StatusBar.Message = plan.Reason;
        StatusBar.IsOpen = true;

        string? hubId = null;
        if (plan.Mode == CommissioningMode.RegisterWithCloud)
        {
            // Reached once the two provisioning gates clear (§8 Q6/Q7). The
            // real call: hubId = await api.RegisterHubAsync(siteId, siteName,
            // hardwareSerial, agentVersion, ct); then persist it below. Left
            // unwired here deliberately — constructing the client requires the
            // backend URL + credential this first-run form does not yet carry,
            // and writing plumbing that reads config that is always empty would
            // be dead code, not a working path.
        }

        var config = new EdgeConfig(
            SiteIdentity: new SiteIdentity(
                SiteId: Guid.NewGuid().ToString(),
                TenantId: tenantCode,
                DisplayName: siteName,
                HubId: hubId),
            Backend: backend,
            Devices: new List<DeviceConfig>(),
            Ui: new UiConfig());

        await Task.Delay(400); // deliberate, so the status is visibly readable, not a flash
        config.Save(_configPath);

        StatusBar.Severity = InfoBarSeverity.Success;
        StatusBar.Title = "Hub commissioned";
        StatusBar.Message = hubId is null
            ? "Site details saved locally. This hub will register with PeakLogic's cloud platform once a backend and operator credential are provisioned."
            : $"Registered with PeakLogic's cloud platform (hub {hubId}).";

        await Task.Delay(1200);
        Frame.Navigate(typeof(ShellPage), _configPath);
    }
}
