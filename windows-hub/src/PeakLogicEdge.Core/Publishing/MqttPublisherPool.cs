using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Client;
using PeakLogicEdge.Core.Configuration;
using PeakLogicEdge.Core.Ingestion;

namespace PeakLogicEdge.Core.Publishing;

// §1.2/§5.1 — one MqttClient per claimed device identity, not one gateway
// identity. From AWS IoT Core's perspective nothing differs from a
// network-native sensor publishing directly to peaklogic/{thingName}/
// telemetry — only where the socket physically lives changes.
public sealed class MqttPublisherPool : IAsyncDisposable
{
    private readonly Dictionary<string, IMqttClient> _clients = new();
    private readonly DeviceMqttClientFactory _factory = new();
    private readonly ILogger _log;
    private readonly string _endpoint;
    private readonly string _certDirectory;

    // certDirectory: root of a per-serial cert-bundle tree, e.g.
    // certDirectory/PLG-0001/certificate.pem + private.key — mirrors
    // scripts/provision-devices.ts's own device-certs/{serial}/ layout.
    public MqttPublisherPool(string endpoint, string certDirectory, ILogger log)
    {
        _endpoint = endpoint;
        _certDirectory = certDirectory;
        _log = log;
    }

    public async Task ConnectAsync(DeviceConfig device, CancellationToken ct)
    {
        if (_clients.ContainsKey(device.ThingName)) return;

        var certPath = Path.Combine(_certDirectory, device.DeviceKey, "certificate.pem");
        var keyPath = Path.Combine(_certDirectory, device.DeviceKey, "private.key");

        var mqttFactory = new MqttFactory();
        var client = mqttFactory.CreateMqttClient();
        var options = _factory.BuildOptions(device, _endpoint, certPath, keyPath);

        client.DisconnectedAsync += async args =>
        {
            _log.LogWarning("MQTT client for {ThingName} disconnected ({Reason}) — will retry on next publish attempt",
                device.ThingName, args.Reason);
            await Task.CompletedTask;
        };

        await client.ConnectAsync(options, ct);
        _clients[device.ThingName] = client;
        _log.LogInformation("MQTT client connected for {ThingName}", device.ThingName);
    }

    public IMqttClient? GetClientFor(string thingName) => _clients.GetValueOrDefault(thingName);

    public async Task PublishAsync(string thingName, TelemetryEnvelopeWirePayload payload, CancellationToken ct)
    {
        var client = GetClientFor(thingName)
            ?? throw new InvalidOperationException($"No connected MQTT client for thing '{thingName}' — call ConnectAsync first.");

        var message = new MqttApplicationMessageBuilder()
            .WithTopic($"peaklogic/{thingName}/telemetry")
            .WithPayload(payload.Json)
            .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();

        await client.PublishAsync(message, ct);
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var client in _clients.Values)
        {
            if (client.IsConnected) await client.DisconnectAsync();
            client.Dispose();
        }
    }
}

// A thin wrapper so PublishAsync's call sites read as "publish this JSON
// payload," not "publish this string" — a real, if small, type-safety win
// over passing raw strings around between the cache and the publisher.
public readonly record struct TelemetryEnvelopeWirePayload(string Json)
{
    public static implicit operator TelemetryEnvelopeWirePayload(string json) => new(json);
}
