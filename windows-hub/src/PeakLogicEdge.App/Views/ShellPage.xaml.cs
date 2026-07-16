using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using PeakLogicEdge.App.Services;
using PeakLogicEdge.Core.Configuration;

namespace PeakLogicEdge.App.Views;

// The real app shell -- moved out of MainWindow so a not-yet-commissioned
// device can show SetupPage first, with no nav chrome for a hub that has
// no site configured yet, rather than showing Dashboard/Sites/etc. next
// to an in-progress setup form.
public sealed partial class ShellPage : Page
{
    private ShellContext? _ctx;

    public ShellPage()
    {
        InitializeComponent();
    }

    protected override async void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);

        var configPath = (string)e.Parameter;
        var config = EdgeConfig.Load(configPath); // guaranteed to exist -- MainWindow only routes here post-setup

        using var loggerFactory = LoggerFactory.Create(builder => builder
            .AddDebug()
            .SetMinimumLevel(LogLevel.Information));
        var runtime = new EdgeRuntimeService(loggerFactory.CreateLogger("PeakLogicEdge"), config.SiteIdentity);
        var theme = new ThemeService(configPath, config);
        _ctx = new ShellContext(runtime, theme, config.SiteIdentity);

        await runtime.StartAsync(DispatcherQueue, System.Threading.CancellationToken.None);

        ContentFrame.Navigate(typeof(DashboardPage), _ctx);
    }

    private void Nav_Loaded(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        Nav.SelectedItem = Nav.MenuItems[0];
    }

    private void Nav_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItemContainer is not NavigationViewItem item || _ctx is null) return;

        var pageType = (item.Tag as string) switch
        {
            "dashboard" => typeof(DashboardPage),
            "sites" => typeof(SitesPage),
            "alerts" => typeof(AlertsPage),
            "tickets" => typeof(TicketsPage),
            "settings" => typeof(SettingsPage),
            _ => typeof(DashboardPage),
        };

        ContentFrame.Navigate(pageType, _ctx);
    }
}
