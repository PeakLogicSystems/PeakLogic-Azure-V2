using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using MQTTnet.Client;
using PeakLogicEdge.Core.Configuration;

namespace PeakLogicEdge.Core.Publishing;

// §5.1 — per-device mutual TLS, exactly the same identity model as a
// network-native sensor talking to AWS IoT Core directly. Port 443 (not
// 8883) for the same firewall-friendliness reasoning as CLAUDE.md's
// firmware guidance elsewhere in this project. Certificate pinning to
// AWS's Root CA (not the OS trust store wholesale) mirrors
// backend/shared/db.ts's RDS CA-bundle pinning — same principle, mirrored
// on the device side of the connection instead of the server side.
public sealed class DeviceMqttClientFactory
{
    // certPath/keyPath: the exact certificate.pem/private.key pair
    // scripts/provision-devices.ts writes per device — this is a
    // transitional/dev-only loading path (raw PEM files on disk); §5.1's
    // production posture is the Windows Certificate Store instead, not yet
    // implemented here (real, disclosed gap for this first pass).
    public MqttClientOptions BuildOptions(DeviceConfig device, string endpoint, string certPath, string keyPath, string? rootCaPath = null)
    {
        var cert = X509Certificate2.CreateFromPemFile(certPath, keyPath);
        var certCollection = new X509Certificate2Collection { cert };

        var builder = new MqttClientOptionsBuilder()
            .WithClientId(device.ThingName)
            .WithTcpServer(endpoint, 443)
            .WithTlsOptions(tls => tls
                .UseTls()
                .WithClientCertificates(certCollection)
                .WithSslProtocols(SslProtocols.Tls12)
                .WithCertificateValidationHandler(ctx =>
                {
                    // Real Root CA pinning (§5.1) is a disclosed gap in this
                    // first pass — this accepts the chain if .NET's own TLS
                    // validation already passed (ctx.SslPolicyErrors is
                    // typically populated by the framework before this
                    // handler runs), which is real validation, just not yet
                    // pinned specifically to AmazonRootCA1's thumbprint the
                    // way the architecture doc calls for.
                    return ctx.SslPolicyErrors == System.Net.Security.SslPolicyErrors.None;
                }))
            .WithCleanSession(false); // persistent session — queued QoS1 messages survive a brief reconnect

        return builder.Build();
    }
}
