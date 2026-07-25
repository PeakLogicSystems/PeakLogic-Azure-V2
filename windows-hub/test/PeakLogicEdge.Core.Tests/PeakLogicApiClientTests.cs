using System.Net;
using System.Text;
using System.Text.Json;
using PeakLogicEdge.Core.Backend;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Security;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// RegisterHubAsync is the .NET client for the real, tested POST /v1/hubs
// contract (backend/api/routes/hubs.ts). The request SHAPE is a contract, not
// a style choice — a wrong method, path, body field, or missing bearer would
// mean the hub silently fails to commission against a real backend. This drives
// the client through a stub transport and asserts every part of that shape,
// plus that it returns the server-assigned id. Mirrors TelemetryEnvelopeTests'
// "the shape is the contract" stance for the ingest side.
public class PeakLogicApiClientTests
{
    [Fact]
    public async Task RegisterHubAsync_SendsContractShape_AndReturnsServerAssignedId()
    {
        // Auth transport: BackendAuthClient reads a seeded refresh token and
        // exchanges it for an access token — stub both so a real bearer flows.
        var authHandler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.OK,
            """{"AuthenticationResult":{"AccessToken":"tok-abc","IdToken":"id-xyz","ExpiresIn":3600}}"""));
        var cognitoHttp = new HttpClient(authHandler) { BaseAddress = new Uri("https://cognito.example/") };
        var secrets = new FakeSecretStore(("kiosk_refresh_token", "refresh-123"));
        var backendConfig = new BackendConfig("https://api.example/", "client-1", "auth.example", "iot.example");
        var auth = new BackendAuthClient(secrets, backendConfig, cognitoHttp);

        // API transport: capture the outbound request, return the real 201 { id }.
        var apiHandler = new StubHttpMessageHandler(_ => JsonResponse(HttpStatusCode.Created, """{"id":"hub-7f3"}"""));
        var apiHttp = new HttpClient(apiHandler) { BaseAddress = new Uri("https://api.example/") };
        var api = new PeakLogicApiClient(apiHttp, auth);

        var hubId = await api.RegisterHubAsync(
            siteId: "site-42", name: "North Plant Hub",
            hardwareSerial: "SER-9", agentVersion: "edge-0.2.1", ct: CancellationToken.None);

        // Server-assigned id is returned (persisted to SiteIdentity.HubId).
        Assert.Equal("hub-7f3", hubId);

        var req = apiHandler.LastRequest!;
        Assert.Equal(HttpMethod.Post, req.Method);
        Assert.Equal("/hubs", req.RequestUri!.AbsolutePath);
        Assert.Equal("Bearer", req.Headers.Authorization!.Scheme);
        Assert.Equal("tok-abc", req.Headers.Authorization.Parameter);

        using var body = JsonDocument.Parse(apiHandler.LastBody!);
        var root = body.RootElement;
        Assert.Equal("site-42", root.GetProperty("siteId").GetString());
        Assert.Equal("North Plant Hub", root.GetProperty("name").GetString());
        Assert.Equal("SER-9", root.GetProperty("hardwareSerial").GetString());
        Assert.Equal("edge-0.2.1", root.GetProperty("agentVersion").GetString());
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode code, string json) =>
        new(code) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

// Minimal in-memory ISecretStore for tests — no DPAPI, no files.
internal sealed class FakeSecretStore : ISecretStore
{
    private readonly Dictionary<string, string> _store;
    public FakeSecretStore(params (string Key, string Value)[] seed) =>
        _store = seed.ToDictionary(x => x.Key, x => x.Value);

    public Task<string?> TryGetAsync(string key) => Task.FromResult(_store.GetValueOrDefault(key));
    public Task SetAsync(string key, string value) { _store[key] = value; return Task.CompletedTask; }
    public Task DeleteAsync(string key) { _store.Remove(key); return Task.CompletedTask; }
}

// Captures the last request (method/uri/headers/body) and returns a canned
// response, so client request-shaping can be asserted without a real server.
internal sealed class StubHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
    public HttpRequestMessage? LastRequest { get; private set; }
    public string? LastBody { get; private set; }

    public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        LastRequest = request;
        if (request.Content is not null) LastBody = await request.Content.ReadAsStringAsync(cancellationToken);
        return _responder(request);
    }
}
