using System.Text.Json;
using System.Text.Json.Serialization;

namespace PeakLogicEdge.Core.Configuration;

// Mirrors the JSON schema in docs/architecture/windows-endpoint-application.md
// §8.1. siteIdentity/backend are set once at commissioning; devices grows
// over the hub's life as sensors are attached; ui is remotely syncable
// non-secret config (§8.2) -- nothing in this file is ever a secret itself,
// see Security/ISecretStore for where credentials actually live.

public sealed record SiteIdentity(
    [property: JsonPropertyName("siteId")] string SiteId,
    [property: JsonPropertyName("tenantId")] string TenantId,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("assignedAccessMode")] string AssignedAccessMode = "shellLauncher");

public sealed record BackendConfig(
    [property: JsonPropertyName("apiBaseUrl")] string ApiBaseUrl,
    [property: JsonPropertyName("cognitoClientId")] string CognitoClientId,
    [property: JsonPropertyName("cognitoAuthDomain")] string CognitoAuthDomain,
    [property: JsonPropertyName("iotEndpoint")] string IotEndpoint);

public sealed record SerialTransport(
    [property: JsonPropertyName("comPortHint")] string ComPortHint,
    [property: JsonPropertyName("usbVidPid")] string? UsbVidPid,
    [property: JsonPropertyName("baudRate")] int BaudRate = 9600);

public sealed record RestPollTransport(
    [property: JsonPropertyName("uri")] string Uri,
    [property: JsonPropertyName("intervalSeconds")] int IntervalSeconds = 30);

// "type" discriminates which of SerialTransport/RestPollTransport/etc. this
// entry actually is -- kept as loosely-typed JsonElement fields rather than
// a polymorphic hierarchy for now (§2.3's three ingestion source types),
// resolved by DeviceConfig.ResolveTransport() below. A real discriminated
// union (System.Text.Json polymorphism) is the natural next step once a
// second transport type actually needs building -- not worth the ceremony
// for one.
public sealed record TransportConfig(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("comPortHint")] string? ComPortHint = null,
    [property: JsonPropertyName("usbVidPid")] string? UsbVidPid = null,
    [property: JsonPropertyName("baudRate")] int BaudRate = 9600,
    [property: JsonPropertyName("uri")] string? Uri = null,
    [property: JsonPropertyName("intervalSeconds")] int IntervalSeconds = 30);

public sealed record DeviceConfig(
    [property: JsonPropertyName("deviceKey")] string DeviceKey,
    [property: JsonPropertyName("thingName")] string ThingName,
    [property: JsonPropertyName("mapper")] string Mapper,
    [property: JsonPropertyName("transport")] TransportConfig Transport,
    [property: JsonPropertyName("certificateThumbprint")] string? CertificateThumbprint = null,
    [property: JsonPropertyName("fieldMap")] Dictionary<string, string>? FieldMap = null);

public sealed record UiConfig(
    [property: JsonPropertyName("defaultInputMode")] string DefaultInputMode = "auto",
    [property: JsonPropertyName("theme")] string Theme = "dark",
    [property: JsonPropertyName("idleReturnToDashboardSeconds")] int IdleReturnToDashboardSeconds = 120);

public sealed record EdgeConfig(
    [property: JsonPropertyName("siteIdentity")] SiteIdentity SiteIdentity,
    [property: JsonPropertyName("backend")] BackendConfig Backend,
    [property: JsonPropertyName("devices")] List<DeviceConfig> Devices,
    [property: JsonPropertyName("ui")] UiConfig Ui)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static EdgeConfig Load(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"Edge config not found at '{path}'. This file is written once at commissioning " +
                "(provisioning package bootstrap) and is not something to fabricate a default for -- " +
                "a missing config means this device was never properly commissioned.", path);
        }

        var json = File.ReadAllText(path);
        var config = JsonSerializer.Deserialize<EdgeConfig>(json, JsonOptions)
            ?? throw new InvalidDataException($"Edge config at '{path}' deserialized to null.");

        return config;
    }

    public void Save(string path)
    {
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
        });
        File.WriteAllText(path, json);
    }
}
