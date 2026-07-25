using PeakLogicEdge.Core.Alarms;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// The edge alarm evaluator is the offline mirror of the cloud's evaluateRuleSet
// (backend/ingest/rules.ts) — same gt/lt math, so an offline alarm matches what
// the cloud would raise. A wrong comparison here fires false alarms or misses
// real ones when the hub is disconnected.
public class EdgeAlarmEvaluatorTests
{
    private static Dictionary<string, double> Metrics(params (string, double)[] m) =>
        m.ToDictionary(x => x.Item1, x => x.Item2);

    [Fact]
    public void GreaterThan_FiresAboveOnly_NotAtOrBelow()
    {
        var rules = new[] { new EdgeAlarmRule("power_kw", AlarmCondition.GreaterThan, 10, "warning") };

        Assert.Single(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("power_kw", 10.5))));
        Assert.Empty(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("power_kw", 10.0)))); // boundary: not >
        Assert.Empty(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("power_kw", 9.9))));
    }

    [Fact]
    public void LessThan_FiresBelowOnly()
    {
        var rules = new[] { new EdgeAlarmRule("flow_lpm", AlarmCondition.LessThan, 100, "warning") };

        Assert.Single(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("flow_lpm", 80))));
        Assert.Empty(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("flow_lpm", 100)))); // boundary
        Assert.Empty(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("flow_lpm", 120))));
    }

    [Fact]
    public void SkipsRuleWhoseMetricIsAbsent()
    {
        var rules = new[] { new EdgeAlarmRule("ph", AlarmCondition.GreaterThan, 7.8, "warning") };
        Assert.Empty(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("temp_c", 40)))); // no 'ph' present
    }

    [Fact]
    public void FiresMultipleRules_AndCarriesSeverity()
    {
        // Two tiers on the same metric, both breached (mirrors the cloud's
        // warning+critical pairs, e.g. power_kw *1.25 and *1.5).
        var rules = new[]
        {
            new EdgeAlarmRule("power_kw", AlarmCondition.GreaterThan, 10, "warning"),
            new EdgeAlarmRule("power_kw", AlarmCondition.GreaterThan, 15, "critical"),
        };

        var fired = EdgeAlarmEvaluator.Evaluate(rules, Metrics(("power_kw", 16)));
        Assert.Equal(2, fired.Count);
        Assert.Contains(fired, f => f.Rule.Severity == "warning");
        Assert.Contains(fired, f => f.Rule.Severity == "critical");
    }

    [Fact]
    public void Message_IsAccurate_AndMarkedEdgeEvaluated()
    {
        var rules = new[] { new EdgeAlarmRule("salt_ppm", AlarmCondition.GreaterThan, 3400, "warning", "Salt") };
        var fired = Assert.Single(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("salt_ppm", 3600))));

        Assert.Equal(3600, fired.Value);
        Assert.Contains("Salt", fired.Message);
        Assert.Contains("above", fired.Message);
        Assert.Contains("3400", fired.Message);
        Assert.Contains("edge-evaluated", fired.Message);
    }

    [Fact]
    public void NonFiniteValue_NeverFires()
    {
        var rules = new[]
        {
            new EdgeAlarmRule("x", AlarmCondition.GreaterThan, 10, "warning"),
            new EdgeAlarmRule("x", AlarmCondition.LessThan, 10, "warning"),
        };
        // NaN compares false either way -> a bad reading raises no false alarm.
        Assert.Empty(EdgeAlarmEvaluator.Evaluate(rules, Metrics(("x", double.NaN))));
    }

    [Fact]
    public void SanitizeMetrics_DropsNonFinite_KeepsFinite()
    {
        var (clean, dropped) = EdgeAlarmEvaluator.SanitizeMetrics(Metrics(
            ("good", 12.5), ("nan", double.NaN), ("inf", double.PositiveInfinity), ("neg_inf", double.NegativeInfinity)));

        Assert.Equal(12.5, clean["good"]);
        Assert.False(clean.ContainsKey("nan"));
        Assert.Equal(3, dropped.Count);
        Assert.Contains("nan", dropped);
        Assert.Contains("inf", dropped);
        Assert.Contains("neg_inf", dropped);
    }
}
