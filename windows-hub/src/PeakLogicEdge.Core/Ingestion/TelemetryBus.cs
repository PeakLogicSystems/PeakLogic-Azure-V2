using System.Threading.Channels;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion;

// §2.1 — decouples ingestion producers from the normalization consumer.
// DropOldest is deliberate: this in-memory bus is a scheduling buffer, not
// the durability mechanism (Caching/TelemetryCache owns that). If the
// consumer briefly stalls, losing the oldest in-flight sample beats
// blocking a serial read thread and risking a UART buffer overrun.
public sealed class TelemetryBus
{
    private readonly Channel<RawReading> _channel = Channel.CreateBounded<RawReading>(
        new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });

    public ChannelWriter<RawReading> Writer => _channel.Writer;
    public ChannelReader<RawReading> Reader => _channel.Reader;
}
