using System.Globalization;

namespace PeakLogicEdge.Core.Alarms;

// Edge alarm evaluation — the .NET mirror of backend/ingest/rules.ts's
// evaluateRuleSet + sanitizeMetrics, so alarms still fire when the hub is
// OFFLINE and cannot reach the cloud (which stays the authority and, when
// reachable, produces the curated alert record + message). Same gt/lt threshold
// math as the cloud, so an offline alarm matches what the cloud would raise.
// Pure — no I/O. The rule SET is provided (cloud-delivered/cached), not compiled
// in: this is the rule-source-agnostic core, exactly like evaluateRuleSet.
public static class EdgeAlarmEvaluator
{
    /// <summary>
    /// Evaluate a resolved rule set against one reading. A rule whose metric is
    /// absent is skipped (not a missing-data alarm) — matches evaluateRuleSet's
    /// `if (value === undefined) continue`. A non-finite value never fires (NaN
    /// compares false either way), so a bad reading raises no false alarm.
    /// </summary>
    public static IReadOnlyList<FiredAlarm> Evaluate(
        IReadOnlyList<EdgeAlarmRule> rules, IReadOnlyDictionary<string, double> metrics)
    {
        var fired = new List<FiredAlarm>();
        foreach (var rule in rules)
        {
            if (!metrics.TryGetValue(rule.Metric, out var value)) continue;

            var isFired = rule.Condition == AlarmCondition.GreaterThan
                ? value > rule.Threshold
                : value < rule.Threshold;

            if (isFired) fired.Add(new FiredAlarm(rule, value, FormatMessage(rule, value)));
        }
        return fired;
    }

    /// <summary>
    /// Drop non-finite metric values (NaN / ±Infinity), mirroring
    /// sanitizeMetrics (Threat Model §4.1). On the edge a bad Modbus/OPC decode
    /// or a faulty sensor can produce one; dropping it before caching/eval keeps
    /// downstream deterministic. Returns the clean set and the dropped names.
    /// </summary>
    public static (IReadOnlyDictionary<string, double> Clean, IReadOnlyList<string> Dropped) SanitizeMetrics(
        IReadOnlyDictionary<string, double> raw)
    {
        var clean = new Dictionary<string, double>(raw.Count);
        var dropped = new List<string>();
        foreach (var (metric, value) in raw)
        {
            if (double.IsFinite(value)) clean[metric] = value;
            else dropped.Add(metric);
        }
        return (clean, dropped);
    }

    // The cloud owns the curated per-rule prose (backend/ingest/rules.ts message
    // functions). The edge produces a functional, accurate message for offline
    // display, marked "(edge-evaluated)" so it's never mistaken for the cloud's
    // authoritative wording.
    private static string FormatMessage(EdgeAlarmRule rule, double value)
    {
        var direction = rule.Condition == AlarmCondition.GreaterThan ? "above" : "below";
        var label = rule.Label ?? rule.Metric;
        return $"{label} {Num(value)} is {direction} the {rule.Severity} threshold {Num(rule.Threshold)} (edge-evaluated)";
    }

    private static string Num(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
