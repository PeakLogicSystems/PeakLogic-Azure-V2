using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using PeakLogicEdge.App.Services;

namespace PeakLogicEdge.App.Views;

public sealed partial class SettingsPage : Page
{
    private EdgeRuntimeService? _runtime;
    private ThemeService? _theme;
    private bool _suppressToggleEvent;

    public SettingsPage()
    {
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);

        var ctx = (ShellContext)e.Parameter;
        _theme = ctx.Theme;

        _suppressToggleEvent = true;
        DarkModeToggle.IsOn = _theme.Current == ElementTheme.Dark;
        _suppressToggleEvent = false;

        if (_runtime is not null) return;

        _runtime = ctx.Runtime;
        RefreshHealth();
        _runtime.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(EdgeRuntimeService.IngestionHealth))
                RefreshHealth();
        };
    }

    private void DarkModeToggle_Toggled(object sender, RoutedEventArgs e)
    {
        if (_suppressToggleEvent || _theme is null) return;
        // Toggle() flips relative to current state -- only call it when the
        // desired state actually differs from Current, so this handler is
        // safe to fire from the programmatic IsOn set above too (guarded
        // by _suppressToggleEvent) without double-toggling.
        var wantDark = DarkModeToggle.IsOn;
        if ((wantDark && _theme.Current != ElementTheme.Dark) || (!wantDark && _theme.Current != ElementTheme.Light))
        {
            _theme.Toggle((FrameworkElement)XamlRoot.Content);
        }
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
