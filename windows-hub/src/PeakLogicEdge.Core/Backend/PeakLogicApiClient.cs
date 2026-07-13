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

    public async Task AcknowledgeAlertAsync(string alertId, string idempotencyKey, CancellationToken ct)
    {
        using var request = await AuthorizedRequestAsync(HttpMethod.Put, $"/alerts/{alertId}", ct);
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        request.Content = JsonContent.Create(new { status = "acknowledged" });
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
    }
}
