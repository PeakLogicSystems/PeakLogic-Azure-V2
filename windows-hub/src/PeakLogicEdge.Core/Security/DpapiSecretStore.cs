using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;

namespace PeakLogicEdge.Core.Security;

// DPAPI (Windows Data Protection API) — the only secret-at-rest mechanism
// this project uses locally, matching §9.3's design. DataProtectionScope.
// LocalMachine (not CurrentUser): this needs to survive being read by both
// the main kiosk-account process AND the separate Watchdog service account
// (§9.1's process-isolation design), and a LocalMachine-scoped blob is
// decryptable by any process on this machine, whereas CurrentUser-scoped
// would only decrypt under the exact same Windows account that encrypted
// it. The real security boundary here is "this specific physical machine,"
// not "this specific Windows account" — consistent with the fixed,
// single-purpose kiosk device model this whole app is built for.
//
// Each secret is one file under %ProgramData%\PeakLogicEdge\secrets\ — a
// machine-wide location (not a user profile path), matching
// DataProtectionScope.LocalMachine's own scope. File ACLs on that
// directory are a real, separate hardening step (§9.5's checklist), not
// handled by this class — DPAPI protects the *content*, NTFS permissions
// protect *who can even attempt to read the file at all*, and both matter.
[SupportedOSPlatform("windows")]
public sealed class DpapiSecretStore : ISecretStore
{
    private readonly string _secretsDirectory;

    public DpapiSecretStore(string? secretsDirectory = null)
    {
        _secretsDirectory = secretsDirectory
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PeakLogicEdge", "secrets");
        Directory.CreateDirectory(_secretsDirectory);
    }

    public Task<string?> TryGetAsync(string key)
    {
        var path = PathFor(key);
        if (!File.Exists(path)) return Task.FromResult<string?>(null);

        var protectedBytes = File.ReadAllBytes(path);
        var plainBytes = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.LocalMachine);
        return Task.FromResult<string?>(Encoding.UTF8.GetString(plainBytes));
    }

    public Task SetAsync(string key, string value)
    {
        var plainBytes = Encoding.UTF8.GetBytes(value);
        var protectedBytes = ProtectedData.Protect(plainBytes, optionalEntropy: null, DataProtectionScope.LocalMachine);
        File.WriteAllBytes(PathFor(key), protectedBytes);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key)
    {
        var path = PathFor(key);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    // Key names are already known-safe identifiers (e.g. "kiosk_refresh_token")
    // chosen by this codebase, never user/network input — a plain filename
    // join is fine, no path-traversal surface to defend against here.
    private string PathFor(string key) => Path.Combine(_secretsDirectory, $"{key}.dat");
}
