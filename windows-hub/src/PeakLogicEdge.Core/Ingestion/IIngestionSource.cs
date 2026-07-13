namespace PeakLogicEdge.Core.Ingestion;

public interface IIngestionSource
{
    string DeviceKey { get; }
    Task RunAsync(CancellationToken ct);
}
