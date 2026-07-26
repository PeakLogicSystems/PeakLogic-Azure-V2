using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Agent;
using PeakLogicEdge.Core.Ingestion;

namespace PeakLogicEdge.Agent;

// Hosts the portable HubAgent as a BackgroundService, so the same agent runs
// under systemd (Linux / Azure IoT Edge module), a Windows Service, or a
// console — the generic host's cancellation drives a clean shutdown either way.
//
// The device source set is a SimulatedIngestionSource for now: no real hardware
// is wired yet (disclosed, the same stance as the old Host harness). Swap it for
// real Modbus/OPC-UA/serial sources built from EdgeConfig once hardware exists —
// nothing else in the agent changes, because sources are just IIngestionSources
// feeding the same pipeline.
public sealed class HubAgentService : BackgroundService
{
    private readonly ILogger<HubAgentService> _log;
    private readonly IConfiguration _config;

    public HubAgentService(ILogger<HubAgentService> log, IConfiguration config)
    {
        _log = log;
        _config = config;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var options = new HubAgentOptions
        {
            ThingNameByDeviceKey = new Dictionary<string, string> { ["demo-chlorinator"] = "plg-demo-0001" },
        };

        // Container durability: inside an IoT Edge module the per-OS default
        // cache path is on the EPHEMERAL container filesystem — wiped on every
        // restart, defeating the durable queue. The deployment manifest sets
        // PEAKLOGIC_CACHE_PATH to a path on a MOUNTED VOLUME (edge/README.md); we
        // honor that override here so the queue actually survives restarts.
        var cachePath = _config["PEAKLOGIC_CACHE_PATH"];
        if (!string.IsNullOrWhiteSpace(cachePath)) options = options with { CachePath = cachePath };

        var agent = new HubAgent(
            sourceFactory: writer => new IIngestionSource[]
            {
                new SimulatedIngestionSource(
                    deviceKey: "demo-chlorinator",
                    metrics: new Dictionary<string, (double Base, double Spread)>
                    {
                        ["temp_c"] = (27.8, 1.5),
                        ["salt_ppm"] = (3200, 100),
                        ["flow_lpm"] = (112, 8),
                    },
                    sink: writer,
                    log: _log,
                    interval: TimeSpan.FromSeconds(5)),
            },
            options: options,
            log: _log);

        return agent.RunAsync(stoppingToken);
    }
}
