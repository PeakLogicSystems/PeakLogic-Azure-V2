import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { NetworkStack } from './network-stack';

interface DataStackProps extends cdk.StackProps {
  network: NetworkStack;
}

export class DataStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.dbInstance = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      // t3.micro for dev/MVP — upgrade to t3.medium when you have paying customers
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.network.rdsSg],
      databaseName: 'peaklogic',
      credentials: rds.Credentials.fromGeneratedSecret('peaklogic_admin'),
      multiAz: false,           // flip to true for prod
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false, // flip to true for prod
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    this.dbSecret = this.dbInstance.secret!;

    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn });
    new cdk.CfnOutput(this, 'DbHost', { value: this.dbInstance.instanceEndpoint.hostname });
  }
}
