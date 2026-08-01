// ⚠️ DEPRECATED — pre-pivot AWS CDK. NOT deployed, NOT referenced by CI or the
// backend. PeakLogic runs on Azure; live infrastructure is Bicep in infra-azure/.
// Retained as read-only historical reference only — see infra/README.md.

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
  // Undefined for dev — see DEV_PLAINTEXT_DB_PASSWORD below. ApiStack must
  // branch on this being present, not assume it always is.
  public readonly dbSecret?: secretsmanager.ISecret;
  // Set only for dev, alongside dbSecret being undefined — ApiStack reads
  // this to wire a DB_PASSWORD env var directly instead of DB_SECRET_ARN.
  public readonly devPlaintextDbPassword?: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const isProd = props.stage === 'prod';
    const isDev = props.stage === 'dev';

    // Home-lab / minimal-cost dev posture: skip Secrets Manager entirely
    // for the RDS credential, not just skip Lambda's runtime call to it.
    // `fromGeneratedSecret()` (the path every other stage still uses)
    // creates a real Secrets Manager secret as a side effect of RDS
    // provisioning itself — that $0.40/month exists whether or not
    // anything ever reads it, so removing only db.ts's runtime
    // GetSecretValue call (see DB_PASSWORD branch there) doesn't fully
    // solve for zero cost on its own; this half does.
    //
    // Real, disclosed trade-off, not a free lunch: `unsafePlainText` is
    // CDK's own explicit escape hatch for exactly this shape of decision —
    // the password ends up in the CloudFormation template/stack outputs in
    // recoverable form, not just in Secrets Manager's access-controlled
    // store. Acceptable for a throwaway/home-lab dev database holding no
    // real customer data; never appropriate for staging or prod, which is
    // why this branch is hard-gated on `isDev` specifically, not a general
    // "non-prod" check the way Multi-AZ/deletion-protection already are.
    // Sourced from CDK context (`-c devDbPassword=...`), fails loud if
    // missing rather than silently generating or defaulting one — matches
    // this project's existing "no default stage" discipline in
    // bin/peaklogic.ts, applied to this one new required context value too.
    const devPlaintextDbPassword = isDev
      ? (this.node.tryGetContext('devDbPassword') as string | undefined)
      : undefined;
    if (isDev && !devPlaintextDbPassword) {
      throw new Error(
        'Missing required context "devDbPassword" for the dev stage (e.g. ' +
        '-c devDbPassword=\'some-local-only-password\'). Dev deliberately ' +
        'skips Secrets Manager for cost reasons (see data-stack.ts) — this ' +
        'is not optional, not a value CDK will generate for you.',
      );
    }
    this.devPlaintextDbPassword = devPlaintextDbPassword;

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
      credentials: isDev
        ? rds.Credentials.fromPassword('peaklogic_admin', cdk.SecretValue.unsafePlainText(devPlaintextDbPassword!))
        : rds.Credentials.fromGeneratedSecret('peaklogic_admin'),
      multiAz: isProd,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: isProd,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // dbInstance.secret is only populated when fromGeneratedSecret() was
    // used above — undefined for dev by design, not a bug. ApiStack must
    // branch on this (see its DB_SECRET_ARN vs. DB_PASSWORD wiring).
    this.dbSecret = this.dbInstance.secret;

    if (this.dbSecret) {
      new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn });
    }
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
    // and errs toward the stronger end of common 30–90 day guidance. Staging
    // and prod rotate — the Lambda only runs periodically, so the marginal
    // cost in staging is negligible, and it's better exercised continuously
    // there too than enabled for prod alone and only tested for the first
    // time under pressure.
    //
    // Dev is skipped entirely, not just "rotation runs but does nothing
    // useful" — there is no Secrets Manager secret for it to rotate (the
    // credentials branch above), and dev's own NetworkStack now provisions
    // zero NAT gateways (network-stack.ts), so PRIVATE_WITH_EGRESS below
    // would have no internet route for the rotation Lambda to reach
    // Secrets Manager even if a secret existed. Calling
    // addRotationSingleUser() for dev would fail at either point.
    if (!isDev) {
      this.dbInstance.addRotationSingleUser({
        automaticallyAfter: cdk.Duration.days(30),
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
    }

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
