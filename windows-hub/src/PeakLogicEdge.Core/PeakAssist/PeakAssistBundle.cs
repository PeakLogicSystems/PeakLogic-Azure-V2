using System.Text.Json.Serialization;

namespace PeakLogicEdge.Core.PeakAssist;

// The PeakAssist bundle a hub receives and installs for offline help
// (PeakAssist Help System Architecture §5). Wire shapes mirror backend/shared/
// peakassist-sync.ts (PeakAssistBundle) and peakassist.ts (HelpContentItem)
// exactly — the checksum is computed over these fields, so their names and the
// alarmType-optionality are a contract, not a style choice.

public sealed record HelpContentItem(
    [property: JsonPropertyName("helpContextKey")] string HelpContextKey,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("body")] string Body,
    [property: JsonPropertyName("alarmType")] string? AlarmType = null);

public sealed record PeakAssistBundle(
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("checksum")] string Checksum,
    [property: JsonPropertyName("content")] IReadOnlyList<HelpContentItem> Content);
