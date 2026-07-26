namespace PeakLogicEdge.Core.Agent;

// Configuration for the headless HubAgent. Nothing here is OS-specific — the
// default cache path resolves per-OS (LocalApplicationData is %LOCALAPPDATA% on
// Windows, ~/.local/share on Linux), and the rest is plain data.
public sealed record HubAgentOptions
{
    /// Where the durable SQLite queue lives (survives process/host restart).
    public string CachePath { get; init; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PeakLogicEdge", "edge-cache.db");

    /// deviceKey -> thingName. In production this comes from EdgeConfig.Devices;
    /// an unmapped device falls back to its own deviceKey.
    public IReadOnlyDictionary<string, string> ThingNameByDeviceKey { get; init; } =
        new Dictionary<string, string>();

    /// How often the agent logs the durable-queue depth.
    public TimeSpan StatusInterval { get; init; } = TimeSpan.FromSeconds(30);
}
