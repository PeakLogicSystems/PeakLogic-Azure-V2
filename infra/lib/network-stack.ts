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
  public readonly rdsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // 2 AZs. 1 NAT gateway for dev/staging (~$32/month, single point of
    // failure if its AZ has an outage — acceptable given both are non-prod).
    // 2 for prod, one per AZ, so a single AZ's NAT outage doesn't take out
    // every Lambda's AWS-API egress platform-wide (Deployment Architecture §3).
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: props.stage === 'prod' ? 2 : 1,
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

    this.rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      description: 'RDS Postgres — only accepts connections from Lambda',
      allowAllOutbound: false,
    });

    this.rdsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(5432), 'Lambda to Postgres');

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
