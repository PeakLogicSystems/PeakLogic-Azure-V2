using Microsoft.UI.Xaml;
using PeakLogicEdge.App.Services;
using PeakLogicEdge.App.Views;
using PeakLogicEdge.Core.Configuration;

namespace PeakLogicEdge.App;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

        var cacheDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PeakLogicEdge");
        Directory.CreateDirectory(cacheDir);
        var configPath = Path.Combine(cacheDir, "hub-config.json");

        // EdgeConfig.Load() itself documents this as the correct signal: a
        // missing config means this device was never commissioned, not an
        // error to work around. First-run detection is exactly that check.
        EdgeConfig? existing = null;
        try { existing = EdgeConfig.Load(configPath); }
        catch (FileNotFoundException) { /* expected on a fresh device -- fall through to Setup */ }

        var theme = new ThemeService(configPath, existing);
        theme.Apply(RootFrame);

        RootFrame.Navigate(existing is null ? typeof(SetupPage) : typeof(ShellPage), configPath);
    }
}
