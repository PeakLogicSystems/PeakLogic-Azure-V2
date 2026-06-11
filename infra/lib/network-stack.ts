import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 2 AZs, 1 NAT gateway (~$32/month). For zero-cost dev, set natGateways: 0
    // and move Lambda to PUBLIC subnets — acceptable for dev, not prod.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
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
  }
}
