using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
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

    // No real backend registration call is attempted here -- there is no
    // deployed backend anywhere for this device to call, and no real
    // hub-registration API contract has been designed yet (Domain Model
    // doesn't model a hub as a claimable entity the way it does individual
    // Devices). Inventing a plausible-looking URL to probe against would
    // be less honest than what this actually does: save real site details
    // locally, and disclose plainly that cloud registration is deferred
    // until a backend and that API contract both exist.
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
        StatusBar.Severity = InfoBarSeverity.Informational;
        StatusBar.Title = "Saving locally";
        StatusBar.Message = "No cloud backend is deployed yet — saving site details to this device only.";
        StatusBar.IsOpen = true;

        var config = new EdgeConfig(
            SiteIdentity: new SiteIdentity(
                SiteId: Guid.NewGuid().ToString(),
                TenantId: tenantCode,
                DisplayName: siteName),
            Backend: new BackendConfig(
                ApiBaseUrl: string.Empty,
                CognitoClientId: string.Empty,
                CognitoAuthDomain: string.Empty,
                IotEndpoint: string.Empty),
            Devices: new List<DeviceConfig>(),
            Ui: new UiConfig());

        await Task.Delay(400); // deliberate, so "Saving locally" is visibly readable, not a flash
        config.Save(_configPath);

        StatusBar.Severity = InfoBarSeverity.Success;
        StatusBar.Title = "Hub commissioned";
        StatusBar.Message = "Site details saved. This hub will register with PeakLogic's cloud platform automatically once a backend is deployed.";

        await Task.Delay(1200);
        Frame.Navigate(typeof(ShellPage), _configPath);
    }
}
