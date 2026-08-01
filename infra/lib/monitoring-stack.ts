// ⚠️ DEPRECATED — pre-pivot AWS CDK. NOT deployed, NOT referenced by CI or the
// backend. PeakLogic runs on Azure; live infrastructure is Bicep in infra-azure/.
// Retained as read-only historical reference only — see infra/README.md.

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { ApiStack } from './api-stack';
import { DataStack } from './data-stack';

interface MonitoringStackProps extends cdk.StackProps {
  api: ApiStack;
  data: DataStack;
  stage: string;
}

// SOC 2 Control Mapping & Evidence Plan §4 (CC4 — Monitoring Activities).
// Real gap found while writing that document: every log source Security
// Architecture §6 and Infrastructure as Code built (Lambda logs, API access
// logs, VPC Flow Logs) is a place a human *could* look after the fact —
// nothing actively watches any of them or notifies anyone. Checked directly
// (grepped every stack for "Alarm"): zero CloudWatch Alarms existed
// anywhere in this codebase before this stack.
export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Notification target — email subscription is optional context
    // (`-c alarmEmail=you@example.com`), not hardcoded, since this document
    // doesn't have authority to pick a real address on the user's behalf.
    // Without it, alarms still fire and are visible in the CloudWatch
    // console/API — just with nobody actively notified, which is honestly
    // disclosed in SOC 2 Control Mapping §4 rather than assumed configured.
    const topic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `peaklogic-${props.stage}-alarms`,
      displayName: `PeakLogic ${props.stage} alarms`,
      enforceSSL: true, // cdk-nag AwsSolutions-SNS3 — caught on first synth, fixed same pattern as S3 buckets elsewhere
    });

    const alarmEmail = this.node.tryGetContext('alarmEmail') as string | undefined;
    if (alarmEmail) {
      topic.addSubscription(new snsSubscriptions.EmailSubscription(alarmEmail));
    }

    const action = new cloudwatchActions.SnsAction(topic);

    // API Lambda error rate — the human-facing surface; errors here are
    // directly user-visible.
    new cloudwatch.Alarm(this, 'ApiFnErrors', {
      alarmName: `peaklogic-${props.stage}-api-fn-errors`,
      metric: props.api.apiFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    // Ingest Lambda error rate — a spike here means real device telemetry
    // is being silently dropped (Threat Model §4.1's own finding was
    // exactly this failure mode, just for one specific cause).
    new cloudwatch.Alarm(this, 'IngestFnErrors', {
      alarmName: `peaklogic-${props.stage}-ingest-fn-errors`,
      metric: props.api.ingestFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    // API Gateway 5xx — server-side failures across every route, not just
    // one Lambda's internal error count (covers throttling responses,
    // integration failures, etc. that metricErrors() above wouldn't).
    new cloudwatch.Alarm(this, 'Api5xx', {
      alarmName: `peaklogic-${props.stage}-api-5xx`,
      metric: props.api.api.metricServerError({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    // RDS CPU — a sustained spike is either a real load/scaling problem or
    // a runaway query; both are things a human should know about.
    new cloudwatch.Alarm(this, 'RdsCpuHigh', {
      alarmName: `peaklogic-${props.stage}-rds-cpu-high`,
      metric: props.data.dbInstance.metricCPUUtilization({ period: cdk.Duration.minutes(5) }),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    // RDS free storage — running out is a hard outage, not a gradual
    // degradation; worth a generous lead time. 2 GiB is a placeholder
    // proportional to the current db.t3.micro/db.t3.medium sizing
    // (Deployment Architecture §3.1), not a formally modeled threshold —
    // revisit if storage sizing changes materially.
    new cloudwatch.Alarm(this, 'RdsStorageLow', {
      alarmName: `peaklogic-${props.stage}-rds-storage-low`,
      metric: props.data.dbInstance.metricFreeStorageSpace({ period: cdk.Duration.minutes(5) }),
      threshold: 2 * 1024 * 1024 * 1024, // 2 GiB, in bytes (CloudWatch's native unit for this metric)
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    new cdk.CfnOutput(this, 'AlarmTopicArn', { value: topic.topicArn });
  }
}
