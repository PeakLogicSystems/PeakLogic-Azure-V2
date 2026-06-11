import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface IoTStackProps extends cdk.StackProps {
  ingestFn: lambda.IFunction;
}

export class IoTStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IoTStackProps) {
    super(scope, id, props);

    // Thing type shared by all PeakLogic sensors
    new iot.CfnThingType(this, 'SensorThingType', {
      thingTypeName: 'PeakLogicSensor',
      thingTypeProperties: {
        thingTypeDescription: 'PeakLogic IoT sensor device',
        searchableAttributes: ['tenantId', 'siteId', 'assetId'],
      },
    });

    // Device policy — each device may only publish to its own topic.
    // ${iot:Connection.Thing.ThingName} is substituted at runtime by IoT Core.
    new iot.CfnPolicy(this, 'DevicePolicy', {
      policyName: 'PeakLogicDevicePolicy',
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

    // Error log group for failed rule deliveries
    const errorLogGroup = new logs.LogGroup(this, 'IoTErrorLogs', {
      logGroupName: '/peaklogic/iot/errors',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    ruleRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [errorLogGroup.logGroupArn],
    }));

    // Topic rule: capture all telemetry and forward to ingest Lambda
    new iot.CfnTopicRule(this, 'TelemetryRule', {
      ruleName: 'PeakLogicTelemetryIngest',
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
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/PeakLogicTelemetryIngest`,
    });
  }
}
