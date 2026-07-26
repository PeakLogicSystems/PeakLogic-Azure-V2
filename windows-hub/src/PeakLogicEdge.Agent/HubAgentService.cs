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

    public HubAgentService(ILogger<HubAgentService> log) => _log = log;

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
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
            options: new HubAgentOptions
            {
                ThingNameByDeviceKey = new Dictionary<string, string> { ["demo-chlorinator"] = "plg-demo-0001" },
            },
            log: _log);

        return agent.RunAsync(stoppingToken);
    }
}
