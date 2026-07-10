import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { NetworkStack } from './network-stack';

interface DataStackProps extends cdk.StackProps {
  network: NetworkStack;
  stage: string;
}

export class DataStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const isProd = props.stage === 'prod';

    this.dbInstance = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      // t3.micro for dev/staging; t3.medium for prod (Deployment Architecture §3)
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        isProd ? ec2.InstanceSize.MEDIUM : ec2.InstanceSize.MICRO,
      ),
      vpc: props.network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.network.rdsSg],
      databaseName: 'peaklogic',
      credentials: rds.Credentials.fromGeneratedSecret('peaklogic_admin'),
      multiAz: isProd,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: isProd,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    this.dbSecret = this.dbInstance.secret!;

    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn });
    new cdk.CfnOutput(this, 'DbHost', { value: this.dbInstance.instanceEndpoint.hostname });

    // cdk-nag suppressions (Infrastructure as Code §4).
    const suppressions: { id: string; reason: string }[] = [
      {
        id: 'AwsSolutions-RDS11',
        reason: 'Default port 5432 is intentional — port obfuscation is weak security theater given RDS already sits in a fully isolated subnet with security-group ingress restricted to the Lambda SG alone (Multi-Tenant Architecture §2.1); network isolation is the real control, matching how TLS cert validation was reasoned about in Security Architecture §4.2.',
      },
      {
        id: 'AwsSolutions-SMG4',
        reason: 'No automatic rotation scheduled yet — real SOC 2-relevant gap, not disputed. Fixing it means provisioning a rotation Lambda (rds.DatabaseInstance#addRotationSingleUser()) inside the VPC and testing it against a real database, a bigger lift than a config flag. Tracked as an open item (Infrastructure as Code §4), not implemented reactively to this finding alone.',
      },
    ];
    // RDS3/RDS10 (Multi-AZ, deletion protection) are correctly ON for prod
    // (isProd above) — only suppress the finding for dev/staging, where
    // they're a deliberate, already-documented MVP cost tradeoff (Deployment
    // Architecture §3.1), not an oversight.
    if (!isProd) {
      suppressions.push(
        {
          id: 'AwsSolutions-RDS3',
          reason: `Multi-AZ intentionally off for the ${props.stage} stage — cost tradeoff already decided in Deployment Architecture §3.1. Prod has it on (isProd ? true above).`,
        },
        {
          id: 'AwsSolutions-RDS10',
          reason: `Deletion protection intentionally off for the ${props.stage} stage, so non-prod environments can be torn down freely — same Deployment Architecture §3.1 decision. Prod has it on.`,
        },
      );
    }
    // applyToChildren: true — the generated-secret finding (SMG4) attaches to
    // the nested Secret construct fromGeneratedSecret() creates, not to
    // dbInstance itself.
    NagSuppressions.addResourceSuppressions(this.dbInstance, suppressions, true);
  }
}
