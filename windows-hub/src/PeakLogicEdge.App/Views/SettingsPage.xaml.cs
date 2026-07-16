using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using PeakLogicEdge.App.Services;

namespace PeakLogicEdge.App.Views;

public sealed partial class SettingsPage : Page
{
    private EdgeRuntimeService? _runtime;

    public SettingsPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);

        _runtime = (EdgeRuntimeService)e.Parameter;
        RefreshHealth();
        _runtime.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(EdgeRuntimeService.IngestionHealth))
                RefreshHealth();
        };
    }

    // IngestionHealth is a plain dictionary, not itself observable per-key
    // -- re-snapshotting into a new list and re-assigning ItemsSource on
    // each refresh tick is simpler and correct for this small (single-
    // digit) source count, rather than building real collection-diffing.
    private void RefreshHealth()
    {
        if (_runtime is null) return;
        HealthList.ItemsSource = _runtime.IngestionHealth.ToList();
    }
}
