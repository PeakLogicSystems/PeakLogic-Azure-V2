namespace PeakLogicEdge.Core.Alarms;

// Edge alarm model (hub-agent-runtime-design.md §7.6). Mirrors the shape of
// backend/ingest/rules.ts's Rule, but with the threshold already RESOLVED to a
// concrete number. This is deliberate: the cloud remains the authority for
// alarms, and it owns the RULES_BY_CATEGORY corpus and the asset-spec-dependent
// threshold functions. The edge evaluates a resolved rule set that is
// delivered/cached from that authority (like a PeakAssist bundle) — so the full
// rule corpus is NOT duplicated in the hub and cannot silently drift out of sync
// with the cloud. Offline alarms are a resilience mirror, not a second source of
// truth (PeakView360 §3.1: alarms are a projection over the cloud Alert).

public enum AlarmCondition { GreaterThan, LessThan }

public sealed record EdgeAlarmRule(
    string Metric,             // canonical metric, e.g. "flow_lpm"
    AlarmCondition Condition,
    double Threshold,          // resolved concrete value
    string Severity,           // "warning" | "critical" — matches Alert['severity']
    string? Label = null);     // optional human label for the message; defaults to the metric name

public sealed record FiredAlarm(EdgeAlarmRule Rule, double Value, string Message);
