import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface IoTStackProps extends cdk.StackProps {
  ingestFn: lambda.IFunction;
  stage: string;
}

// Deployment Architecture §2: IoT thing/policy/rule/log-group names are
// suffixed by stage like every other account+region-unique resource, BUT the
// MQTT topic namespace itself (peaklogic/{thingName}/telemetry|commands) is
// deliberately NOT stage-scoped — that would touch device firmware/
// provisioning config, out of proportion for this fix. Consequence: the
// TopicRule's SQL ('peaklogic/+/telemetry', unscoped by stage) would match
// ANY stage's devices if dev and prod IoT stacks were ever both deployed to
// the same AWS account — both stages' ingest Lambdas would fire on the same
// telemetry. Operational rule instead: only one stage's IoT stack may be
// deployed per AWS account at a time, or use separate accounts per stage if
// dev and prod need real devices reporting simultaneously.
export class IoTStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IoTStackProps) {
    super(scope, id, props);

    // Thing type shared by all PeakLogic sensors
    new iot.CfnThingType(this, 'SensorThingType', {
      thingTypeName: `PeakLogicSensor-${props.stage}`,
      thingTypeProperties: {
        thingTypeDescription: 'PeakLogic IoT sensor device',
        searchableAttributes: ['tenantId', 'siteId', 'assetId'],
      },
    });

    // Device policy — each device may only publish to its own topic.
    // ${iot:Connection.Thing.ThingName} is substituted at runtime by IoT Core.
    new iot.CfnPolicy(this, 'DevicePolicy', {
      policyName: `PeakLogicDevicePolicy-${props.stage}`,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'iot:Connect',
            Resource: `arn:aws:iot:${this.region}:${this.account}:client/\${iot:ClientId}`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            // Device can only publish on its own telemetry topic
            Resource: `arn:aws:iot:${this.region}:${this.account}:topic/peaklogic/\${iot:Connection.Thing.ThingName}/telemetry`,
          },
          {
            Effect: 'Allow',
            Action: ['iot:Subscribe', 'iot:Receive'],
            // Device can only receive on its own commands topic
            Resource: [
              `arn:aws:iot:${this.region}:${this.account}:topicfilter/peaklogic/\${iot:Connection.Thing.ThingName}/commands`,
              `arn:aws:iot:${this.region}:${this.account}:topic/peaklogic/\${iot:Connection.Thing.ThingName}/commands`,
            ],
          },
        ],
      },
    });

    // IoT → Lambda invocation role
    const ruleRole = new iam.Role(this, 'IoTRuleRole', {
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
    });
    props.ingestFn.grantInvoke(ruleRole);

    // cdk-nag AwsSolutions-IAM5 (Infrastructure as Code §2.2): grantInvoke()
    // grants lambda:InvokeFunction on both the function's base ARN and its
    // ":*" suffix (covering qualified/aliased invocations) — CDK's own
    // standard Lambda-invoke grant shape, not a hand-added wildcard.
    NagSuppressions.addResourceSuppressions(ruleRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Standard CDK grantInvoke() shape: base function ARN + ":*" for qualified/aliased invocations, scoped to this one ingest function only — not an open resource grant.',
        appliesTo: [{ regex: '/^Resource::<.+\\.Arn>:\\*$/' }],
      },
    ], true);

    // Error log group for failed rule deliveries
    const errorLogGroup = new logs.LogGroup(this, 'IoTErrorLogs', {
      logGroupName: `/peaklogic/${props.stage}/iot/errors`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    ruleRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [errorLogGroup.logGroupArn],
    }));

    // Topic rule: capture all telemetry and forward to ingest Lambda.
    // IoT rule names can't contain hyphens, so the stage is joined with an
    // underscore here (unlike every other stage-suffixed resource name above).
    const ruleName = `PeakLogicTelemetryIngest_${props.stage}`;
    new iot.CfnTopicRule(this, 'TelemetryRule', {
      ruleName,
      topicRulePayload: {
        // topic(2) extracts the thing name from peaklogic/{thingName}/telemetry
        sql: "SELECT *, topic(2) AS thingName FROM 'peaklogic/+/telemetry'",
        awsIotSqlVersion: '2016-03-23',
        actions: [
          { lambda: { functionArn: props.ingestFn.functionArn } },
        ],
        errorAction: {
          cloudwatchLogs: {
            logGroupName: errorLogGroup.logGroupName,
            roleArn: ruleRole.roleArn,
          },
        },
      },
    });

    // Allow IoT Core to invoke the Lambda
    props.ingestFn.addPermission('IoTInvoke', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/${ruleName}`,
    });
  }
}
