using System.Collections.Specialized;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using PeakLogicEdge.App.Services;

namespace PeakLogicEdge.App.Views;

public sealed partial class AlertsPage : Page
{
    private EdgeRuntimeService? _runtime;

    public AlertsPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);

        var ctx = (ShellContext)e.Parameter;
        if (_runtime is not null) return;

        _runtime = ctx.Runtime;
        AlertsList.ItemsSource = _runtime.ActiveAlerts;
        _runtime.ActiveAlerts.CollectionChanged += (_, _) => UpdateEmptyState();
        UpdateEmptyState();
    }

    private void UpdateEmptyState()
    {
        EmptyStateText.Visibility = _runtime?.ActiveAlerts.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private async void ClearButton_Click(object sender, RoutedEventArgs e)
    {
        if (_runtime is null || sender is not Button { Tag: long id }) return;
        await _runtime.ClearAlertAsync(id);
    }
}
