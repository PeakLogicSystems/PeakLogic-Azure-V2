using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Agent;
using PeakLogicEdge.Core.Ingestion;

// Dev console harness over the SAME shared HubAgent the production
// PeakLogicEdge.Agent service runs — no longer a second copy of the pipeline
// (dual-platform-hub-design.md §3). `dotnet run` this to watch the real
// ingestion -> normalization -> durable SQLite queue pipeline live, before any
// backend/hardware exists: readings are durably queued, not published, which is
// exactly the offline-durability behavior. Nothing is faked to look published.
using var loggerFactory = LoggerFactory.Create(builder => builder
    .AddSimpleConsole(o => { o.SingleLine = true; o.TimestampFormat = "HH:mm:ss "; })
    .SetMinimumLevel(LogLevel.Information));
var log = loggerFactory.CreateLogger("PeakLogicEdge");

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

// Demo device: the Pentair IntelliChlor salt-chlorinator example from the
// product ask — one device, three channels. SimulatedIngestionSource stands in
// for real hardware (none wired yet); swap for a real source and nothing else
// changes.
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
            log: log,
            interval: TimeSpan.FromSeconds(5)),
    },
    options: new HubAgentOptions
    {
        ThingNameByDeviceKey = new Dictionary<string, string> { ["demo-chlorinator"] = "plg-demo-0001" },
        StatusInterval = TimeSpan.FromSeconds(15),
    },
    log: log);

log.LogInformation("PeakLogic Edge — dev console harness. Press Ctrl+C to stop.");
await agent.RunAsync(cts.Token);
