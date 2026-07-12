import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface NetworkStackProps extends cdk.StackProps {
  stage: string;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // 2 AZs. 0 NAT gateways for dev (home-lab/cost-minimal posture, added —
    // see data-stack.ts's DEV_PLAINTEXT_DB_PASSWORD path and db.ts's
    // DB_PASSWORD branch, which together remove apiFn/ingestFn's only real
    // reason to need internet egress: fetching the RDS credential from
    // Secrets Manager. With that removed, dev's Lambdas touch nothing
    // outside the VPC for core telemetry/API functionality — no NAT, no
    // VPC endpoint, needed. Real, disclosed limitation: any code path that
    // DOES need genuine internet (Cognito Admin* calls for team/staff
    // invites, the ticket webhook feature) will fail outright on dev with
    // zero NAT gateways — acceptable for a single-operator home-lab
    // deployment exercising core telemetry ingestion, not something to
    // carry into staging/prod.
    // 1 NAT gateway for staging (~$32/month, single point of failure if its
    // AZ has an outage — acceptable, staging is still non-prod). 2 for prod,
    // one per AZ, so a single AZ's NAT outage doesn't take out every
    // Lambda's AWS-API egress platform-wide (Deployment Architecture §3).
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: props.stage === 'prod' ? 2 : props.stage === 'staging' ? 1 : 0,
      subnetConfiguration: [
        { name: 'public',   subnetType: ec2.SubnetType.PUBLIC,              cidrMask: 24 },
        { name: 'private',  subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED,    cidrMask: 24 },
      ],
    });

    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: 'Lambda functions — outbound only',
      allowAllOutbound: true,
    });

    // RdsSg used to live here, but moved to DataStack (Infrastructure as
    // Code §2.3): only DataStack ever consumed it, and Secrets Manager
    // rotation's SecretRotation construct unconditionally calls
    // target.connections.allowDefaultPortFrom(...) internally, which needs
    // the DB's own endpoint port (a DataStack value) to build the ingress
    // rule it adds to the DB's security group. With rdsSg living here in
    // NetworkStack — created before DataStack even exists in bin/peaklogic.ts
    // — that ingress rule would have forced NetworkStack to depend back on
    // DataStack, a structurally unfixable cycle regardless of which stack
    // called the rotation API or how the security group was supplied. See
    // DataStack for the full explanation and the working fix.

    // Flow Logs — cdk-nag AwsSolutions-VPC7; also the network-level half of
    // the incident-response forensic sources Security Architecture §6 lists
    // (Lambda logs, audit_log_entries) — closes "how would a responder see
    // rejected/unusual network traffic," which neither of those cover.
    new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(
        new logs.LogGroup(this, 'VpcFlowLogGroup', {
          logGroupName: `/peaklogic/${props.stage}/vpc/flow-logs`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      ),
    });
  }
}
