using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using PeakLogicEdge.App.Services;

namespace PeakLogicEdge.App.Views;

// Direct code-behind data-binding rather than a full ViewModels/ layer
// (the architecture doc S11.2's recommended project structure) -- a
// pragmatic simplification for this first pass, not a design decision to
// keep long-term. Real, disclosed scope-trim, not an oversight.
public sealed partial class DashboardPage : Page
{
    private EdgeRuntimeService? _runtime;

    public DashboardPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);

        if (_runtime is not null) return; // already wired from a prior navigation to this page instance

        _runtime = (EdgeRuntimeService)e.Parameter;
        ReadingsList.ItemsSource = _runtime.RecentReadings;

        PendingCountText.Text = _runtime.PendingCount.ToString();
        _runtime.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(EdgeRuntimeService.PendingCount))
                PendingCountText.Text = _runtime.PendingCount.ToString();
        };
    }
}
