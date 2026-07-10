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

    // RDS's own security group lives here, not in NetworkStack (Infrastructure
    // as Code §2.3) — only DataStack ever consumed it, and Secrets Manager
    // rotation's SecretRotation construct unconditionally needs to add an
    // ingress rule referencing the DB's own endpoint port to whichever stack
    // owns this security group. Keeping it here (where the DB and its
    // rotation both live) means that reference never needs to cross stacks
    // at all — see the addRotationSingleUser() call below for how this
    // avoided a real, structurally-unfixable dependency cycle that occurred
    // when this security group lived in NetworkStack instead (created before
    // DataStack even exists in bin/peaklogic.ts, so it could never depend
    // back on DataStack for anything).
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: props.network.vpc,
      description: 'RDS Postgres — only accepts connections from Lambda and the rotation function',
      allowAllOutbound: false,
    });
    rdsSg.addIngressRule(props.network.lambdaSg, ec2.Port.tcp(5432), 'Lambda to Postgres');

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
      securityGroups: [rdsSg],
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

    // Automatic rotation (Infrastructure as Code §2.3 → now fixed, not just
    // flagged) — cdk-nag AwsSolutions-SMG4. Uses the AWS-provided
    // single-user rotation Lambda (SecretsManagerRDSPostgreSQLRotationSingleUser
    // via the Serverless Application Repository).
    //
    // Deliberately called here, in the same stack as dbInstance/rdsSg, after
    // two failed attempts elsewhere: (1) calling it directly on dbInstance
    // from within ApiStack still nested the construct under DataStack
    // regardless (addRotationSingleUser is a method ON dbInstance — `this`
    // inside it is always dbInstance, not wherever the calling code lives);
    // (2) constructing secretsmanager.SecretRotation directly with ApiStack
    // as its scope avoided that specific issue, but SecretRotation
    // unconditionally calls target.connections.allowDefaultPortFrom(...)
    // internally, which needs the DB's own endpoint port to build the
    // ingress rule — and that rule is placed in whichever stack owns rdsSg.
    // With rdsSg previously living in NetworkStack (created before DataStack
    // exists), that ingress rule forced NetworkStack to depend back on
    // DataStack — a real, structurally unfixable cycle, independent of which
    // stack called the rotation API. Moving rdsSg itself into this stack
    // (above) was the actual fix; calling addRotationSingleUser() here,
    // where the DB, its secret, and its security group all already live, is
    // what makes that fix work — every reference addRotationSingleUser
    // needs is now local to this one stack, and the only cross-stack
    // reference is Data -> Network for vpc/lambdaSg's subnet info, the same
    // direction DataStack already needed for the DB itself.
    //
    // vpcSubnets is explicit, not left to default: the DB itself sits in
    // PRIVATE_ISOLATED (no NAT, no internet route), which the rotation
    // Lambda cannot use for itself — it needs to reach the Secrets Manager
    // API endpoint to write the new credential, not just the DB.
    // PRIVATE_WITH_EGRESS is the same subnet type api-stack.ts's Lambdas
    // already use successfully for that same reason. securityGroup is left
    // to auto-create (unlike the earlier failed attempts) — no longer
    // necessary to pre-supply one now that the cycle's real cause is fixed.
    //
    // 30 days: no SOC 2-mandated interval exists, but it's standard practice
    // and errs toward the stronger end of common 30–90 day guidance. All
    // stages rotate — the Lambda only runs periodically, so the marginal
    // cost in dev/staging is negligible, and it's better exercised
    // continuously everywhere than enabled for prod alone and only tested
    // for the first time under pressure.
    this.dbInstance.addRotationSingleUser({
      automaticallyAfter: cdk.Duration.days(30),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // cdk-nag suppressions (Infrastructure as Code §2.2).
    const suppressions: { id: string; reason: string }[] = [
      {
        id: 'AwsSolutions-RDS11',
        reason: 'Default port 5432 is intentional — port obfuscation is weak security theater given RDS already sits in a fully isolated subnet with security-group ingress restricted to the Lambda SG alone (Multi-Tenant Architecture §2.1); network isolation is the real control, matching how TLS cert validation was reasoned about in Security Architecture §4.2.',
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
    // applyToChildren: true — some findings on nested constructs
    // fromGeneratedSecret() creates (e.g. the Secret itself), not
    // dbInstance directly.
    NagSuppressions.addResourceSuppressions(this.dbInstance, suppressions, true);
  }
}
