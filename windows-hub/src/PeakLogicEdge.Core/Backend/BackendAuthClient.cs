using System.Net.Http.Json;
using System.Text.Json.Serialization;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Security;

namespace PeakLogicEdge.Core.Backend;

// §5.2 — the kiosk's own dedicated Cognito identity (a tenant user
// provisioned via POST /v1/settings/team, role operator), REFRESH_TOKEN_AUTH
// flow since there's no interactive login on a kiosk. The refresh token
// itself is seeded once at commissioning and never re-derived here.
public sealed record CachedTokens(string AccessToken, string IdToken, DateTimeOffset ExpiresAt);

internal sealed record CognitoAuthResult(
    [property: JsonPropertyName("AccessToken")] string AccessToken,
    [property: JsonPropertyName("IdToken")] string IdToken,
    [property: JsonPropertyName("ExpiresIn")] int ExpiresIn);

internal sealed record CognitoAuthResponse(
    [property: JsonPropertyName("AuthenticationResult")] CognitoAuthResult AuthenticationResult);

public sealed class BackendAuthClient
{
    private readonly ISecretStore _secrets;
    private readonly BackendConfig _config;
    private readonly HttpClient _cognitoHttp;
    private CachedTokens? _cached;

    private const string RefreshTokenKey = "kiosk_refresh_token";

    public BackendAuthClient(ISecretStore secrets, BackendConfig config, HttpClient cognitoHttp)
    {
        _secrets = secrets;
        _config = config;
        _cognitoHttp = cognitoHttp;
    }

    public async Task<string> GetValidAccessTokenAsync(CancellationToken ct)
    {
        if (_cached is { } cached && cached.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(2))
        {
            return cached.AccessToken;
        }

        var refreshToken = await _secrets.GetRequiredAsync(RefreshTokenKey);

        var request = new HttpRequestMessage(HttpMethod.Post, "/")
        {
            Content = JsonContent.Create(new
            {
                AuthFlow = "REFRESH_TOKEN_AUTH",
                ClientId = _config.CognitoClientId,
                AuthParameters = new { REFRESH_TOKEN = refreshToken },
            }),
        };
        request.Headers.Add("X-Amz-Target", "AWSCognitoIdentityProviderService.InitiateAuth");
        request.Content!.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/x-amz-json-1.1");

        var response = await _cognitoHttp.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<CognitoAuthResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Cognito refresh response did not deserialize.");

        var tokens = new CachedTokens(
            result.AuthenticationResult.AccessToken,
            result.AuthenticationResult.IdToken,
            DateTimeOffset.UtcNow.AddSeconds(result.AuthenticationResult.ExpiresIn));

        _cached = tokens;
        return tokens.AccessToken;
    }

    // Called once at commissioning (provisioning package bootstrap, §8.3) —
    // never during normal operation.
    public Task SeedRefreshTokenAsync(string refreshToken) => _secrets.SetAsync(RefreshTokenKey, refreshToken);
}
