using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PeakLogicEdge.App.Services;
using PeakLogicEdge.App.Views;

namespace PeakLogicEdge.App;

public sealed partial class MainWindow : Window
{
    private readonly CancellationTokenSource _cts = new();
    private readonly EdgeRuntimeService _runtime;

    public MainWindow()
    {
        InitializeComponent();

        using var loggerFactory = LoggerFactory.Create(builder => builder
            .AddDebug()
            .SetMinimumLevel(LogLevel.Information));
        _runtime = new EdgeRuntimeService(loggerFactory.CreateLogger("PeakLogicEdge"));

        Closed += (_, _) => _cts.Cancel();
    }

    private async void Nav_Loaded(object sender, RoutedEventArgs e)
    {
        // Same real pipeline PeakLogicEdge.Host runs (S2.1's "no AWS
        // backend, no real hardware yet" disclosure still applies -- see
        // EdgeRuntimeService's own header comment) -- started once,
        // shared across every page via the Frame navigation parameter
        // below, not re-created per page.
        await _runtime.StartAsync(DispatcherQueue, _cts.Token);

        ContentFrame.Navigate(typeof(DashboardPage), _runtime);
        Nav.SelectedItem = Nav.MenuItems[0];
    }

    private void Nav_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItemContainer is not NavigationViewItem item) return;

        var pageType = (item.Tag as string) switch
        {
            "dashboard" => typeof(DashboardPage),
            "sites" => typeof(SitesPage),
            "alerts" => typeof(AlertsPage),
            "tickets" => typeof(TicketsPage),
            "settings" => typeof(SettingsPage),
            _ => typeof(DashboardPage),
        };

        ContentFrame.Navigate(pageType, _runtime);
    }
}
