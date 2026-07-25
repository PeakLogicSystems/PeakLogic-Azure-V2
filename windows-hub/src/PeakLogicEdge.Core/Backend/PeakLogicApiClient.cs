using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PeakLogicEdge.Core.Backend;

// §5.2 — Cognito-authenticated HTTPS client for the kiosk UI's data needs
// (site/asset/device/alert/ticket reads, the device-claim/onboarding
// write). Mirrors backend/api/routes/*.ts's real shapes, not a redesign.
public sealed record Site(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("type")] string Type);

public sealed record Asset(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("site_id")] string SiteId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("category")] string Category);

public sealed record Device(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("serial")] string Serial,
    [property: JsonPropertyName("thing_name")] string ThingName,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("asset_id")] string? AssetId);

// The server-assigned identity returned by POST /v1/hubs — mirrors the
// backend's `created({ id })` response (backend/api/routes/hubs.ts).
public sealed record HubRegistration(
    [property: JsonPropertyName("id")] string Id);

public sealed class PeakLogicApiClient
{
    private readonly HttpClient _http;
    private readonly BackendAuthClient _auth;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public PeakLogicApiClient(HttpClient http, BackendAuthClient auth)
    {
        _http = http;
        _auth = auth;
    }

    private async Task<HttpRequestMessage> AuthorizedRequestAsync(HttpMethod method, string path, CancellationToken ct)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _auth.GetValidAccessTokenAsync(ct));
        return request;
    }

    public async Task<IReadOnlyList<Site>> GetSitesAsync(CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Get, "/sites", ct);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<Site>>(JsonOptions, ct) ?? [];
    }

    public async Task<IReadOnlyList<Device>> GetDevicesAsync(string? assetId, string? siteId, CancellationToken ct)
    {
        var query = new List<string>();
        if (assetId is not null) query.Add($"assetId={Uri.EscapeDataString(assetId)}");
        if (siteId is not null) query.Add($"siteId={Uri.EscapeDataString(siteId)}");
        var path = "/devices" + (query.Count > 0 ? "?" + string.Join('&', query) : "");

        using var request = await AuthorizedRequestAsync(HttpMethod.Get, path, ct);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<Device>>(JsonOptions, ct) ?? [];
    }

    // POST /v1/devices — the same claim endpoint the web app's onboarding
    // wizard calls (DeviceOnboard.tsx), matching windows-endpoint-
    // application.md §1.2/§8.3: every locally-bridged device is claimed
    // through this, not a special hub-only path.
    public async Task<Device> ClaimDeviceAsync(string serial, string? assetId, CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Post, "/devices", ct);
        request.Content = JsonContent.Create(new { serial, assetId });
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Device>(JsonOptions, ct)
            ?? throw new InvalidOperationException("Claim response did not deserialize.");
    }

    // POST /v1/hubs — register THIS hub for a site, closing the commissioning
    // loop (hub-agent-runtime-design.md §7 step 1). Mirrors the real, tested
    // contract in backend/api/routes/hubs.ts exactly: { siteId, name,
    // hardwareSerial?, agentVersion? } in; the server-assigned hub id out. The
    // hub starts `provisioning` server-side and its first heartbeat flips it
    // online. Admin-gated server-side (requireRole 'admin'), so the caller's
    // token must carry admin — see §8 Q6 (first-run auth) for how a bare hub
    // obtains one. `siteId` is the real site FK, not a display name — see §8 Q7
    // (site resolution). The returned id is persisted to SiteIdentity.HubId.
    public async Task<string> RegisterHubAsync(
        string siteId, string name, string? hardwareSerial, string? agentVersion, CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Post, "/hubs", ct);
        request.Content = JsonContent.Create(new { siteId, name, hardwareSerial, agentVersion });
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<HubRegistration>(JsonOptions, ct)
            ?? throw new InvalidOperationException("Hub registration response did not deserialize.")).Id;
    }

    public async Task AcknowledgeAlertAsync(string alertId, string idempotencyKey, CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Put, $"/alerts/{alertId}", ct);
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        request.Content = JsonContent.Create(new { status = "acknowledged" });
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
    }
}
