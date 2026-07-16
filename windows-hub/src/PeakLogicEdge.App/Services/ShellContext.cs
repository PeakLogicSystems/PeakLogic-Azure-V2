using PeakLogicEdge.Core.Configuration;

namespace PeakLogicEdge.App.Services;

// Bundled navigation parameter for every page inside the post-setup shell
// (Dashboard/Sites/Alerts/Tickets/Settings) -- avoids plumbing three
// separate parameters (runtime, theme, site identity) through every
// Frame.Navigate call individually.
public sealed record ShellContext(EdgeRuntimeService Runtime, ThemeService Theme, SiteIdentity Site);
