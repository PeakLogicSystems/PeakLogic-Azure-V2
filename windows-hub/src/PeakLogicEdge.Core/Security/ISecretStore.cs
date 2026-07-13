namespace PeakLogicEdge.Core.Security;

// windows-endpoint-application.md §9.3 — every local secret (Cognito
// refresh token, cached access/ID tokens, technician PIN hash) goes
// through this, never plain files, never in EdgeConfig (which is
// deliberately non-secret, see Configuration/EdgeConfig.cs).
public interface ISecretStore
{
    Task<string?> TryGetAsync(string key);
    Task SetAsync(string key, string value);
    Task DeleteAsync(string key);

    async Task<string> GetRequiredAsync(string key)
    {
        var value = await TryGetAsync(key);
        if (value is null)
        {
            throw new InvalidOperationException(
                $"Required secret '{key}' is missing. This device may not have completed " +
                "commissioning, or its local secret store was reset.");
        }
        return value;
    }
}
