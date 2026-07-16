using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using PeakLogicEdge.Core.Configuration;

namespace PeakLogicEdge.App.Services;

// Light/dark mode -- user-toggled and persisted, not the OS media-query
// strategy, mirroring the tenant web app's own SET-4 ThemeContext decision
// (frontend/tailwind.config.ts's "darkMode: 'class', user-toggled"
// comment). WinUI 3's built-in controls (NavigationView, ListView,
// InfoBar, etc.) already ship correct light/dark visuals out of the box --
// this service's whole job is setting the content area's RequestedTheme
// and persisting the choice through EdgeConfig.Ui.Theme, not
// reimplementing theming from scratch.
//
// The toggle deliberately does NOT apply to the NavigationView's pane --
// ShellPage.xaml fixes that permanently to Dark (RequestedTheme="Dark" +
// an explicit PaneBackground), matching marketing/index.html's own
// fixed-dark canvas, since the brand wordmark's "Peak" text is a fixed
// white brush (real brand color, not theme-adaptive -- see
// Controls/BrandHeader.xaml) that would go illegible against a
// light-themed pane. Only the CONTENT area (ContentFrame, inside the
// NavigationView) follows the user's actual choice.
public sealed class ThemeService
{
    private readonly string _configPath;
    private EdgeConfig? _config;

    public ThemeService(string configPath, EdgeConfig? config)
    {
        _configPath = configPath;
        _config = config;
    }

    public ElementTheme Current =>
        (_config?.Ui.Theme ?? "dark") == "light" ? ElementTheme.Light : ElementTheme.Dark;

    public void Apply(FrameworkElement root)
    {
        root.RequestedTheme = Current;
        ApplyToContentFrame(root, Current);
    }

    public void Toggle(FrameworkElement root)
    {
        var next = Current == ElementTheme.Light ? "dark" : "light";

        if (_config is not null)
        {
            _config = _config with { Ui = _config.Ui with { Theme = next } };
            _config.Save(_configPath);
        }

        var theme = next == "light" ? ElementTheme.Light : ElementTheme.Dark;
        root.RequestedTheme = theme;
        ApplyToContentFrame(root, theme);
    }

    // Real bug found by actually toggling the switch, not assumed correct
    // from the API surface alone: setting RequestedTheme on the window
    // root cascades down through NavigationView into its own Content
    // (ContentFrame) -- so once ShellPage.xaml pins the NavigationView
    // itself to a permanent RequestedTheme="Dark" (for the pane's sake),
    // that fixed Dark would otherwise shadow whatever the window root
    // says for ContentFrame too, since ContentFrame is NavigationView's
    // child, not a sibling. Explicitly re-setting RequestedTheme directly
    // on the Frame overrides that inherited value back to the real
    // user-selected theme -- the minimal, targeted fix for the actual
    // symptom observed (content silently stuck on whatever the pane was
    // fixed to), not a guess.
    private static void ApplyToContentFrame(FrameworkElement root, ElementTheme theme)
    {
        foreach (var nav in FindDescendants<NavigationView>(root))
        {
            if (nav.Content is FrameworkElement contentFrame)
            {
                contentFrame.RequestedTheme = theme;
            }
        }
    }

    private static IEnumerable<T> FindDescendants<T>(DependencyObject parent) where T : DependencyObject
    {
        var count = VisualTreeHelper.GetChildrenCount(parent);
        for (var i = 0; i < count; i++)
        {
            var child = VisualTreeHelper.GetChild(parent, i);
            if (child is T match) yield return match;
            foreach (var descendant in FindDescendants<T>(child)) yield return descendant;
        }
    }
}
