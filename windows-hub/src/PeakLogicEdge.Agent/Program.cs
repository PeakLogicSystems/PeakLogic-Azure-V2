using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using PeakLogicEdge.Agent;

// PeakLogic Hub — cross-platform headless agent entry point (dual-platform-hub-
// design.md). One binary that adapts to how it's launched:
//   - UseSystemd()        — Linux systemd unit (and the process model Azure IoT
//                           Edge runs .NET modules under)
//   - UseWindowsService() — a Windows Service
//   - neither             — a plain console (dev / foreground)
// Each call detects and no-ops off its own environment, so this is safe to run
// anywhere.
await Host.CreateDefaultBuilder(args)
    .UseSystemd()
    .UseWindowsService(options => options.ServiceName = "PeakLogic Hub Agent")
    .ConfigureServices(services => services.AddHostedService<HubAgentService>())
    .Build()
    .RunAsync();
