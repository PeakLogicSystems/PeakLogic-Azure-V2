import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { NetworkStack } from './network-stack';
import { DataStack } from './data-stack';
import { AuthStack } from './auth-stack';

interface ApiStackProps extends cdk.StackProps {
  network: NetworkStack;
  data: DataStack;
  auth: AuthStack;
}

export class ApiStack extends cdk.Stack {
  public readonly ingestFn: lambda.IFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const commonEnv = {
      DB_SECRET_ARN: props.data.dbSecret.secretArn,
      DB_HOST:       props.data.dbInstance.instanceEndpoint.hostname,
      DB_NAME:       'peaklogic',
      NODE_ENV:      'production',
    };

    const commonProps: Omit<lambdaNode.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc: props.network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.network.lambdaSg],
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: false, target: 'node20' },
    };

    // ── Ingest Lambda (called directly by IoT Core rule) ──────────────────
    const ingestFn = new lambdaNode.NodejsFunction(this, 'IngestFn', {
      ...commonProps,
      functionName: 'peaklogic-ingest',
      entry: path.join(__dirname, '../../backend/ingest/handler.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    props.data.dbSecret.grantRead(ingestFn);
    this.ingestFn = ingestFn;

    // ── API Lambda (all REST routes, path-routed internally) ──────────────
    const apiFn = new lambdaNode.NodejsFunction(this, 'ApiFn', {
      ...commonProps,
      functionName: 'peaklogic-api',
      entry: path.join(__dirname, '../../backend/api/handler.ts'),
      handler: 'handler',
      environment: {
        ...commonEnv,
        USER_POOL_ID: props.auth.userPool.userPoolId,
      },
    });
    props.data.dbSecret.grantRead(apiFn);

    // ── API Gateway ────────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'peaklogic-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // tighten to your domain in prod
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'v1',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        throttlingBurstLimit: 200,
        throttlingRateLimit: 100,
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.auth.userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    const integration = new apigateway.LambdaIntegration(apiFn);
    const auth: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Route map — single Lambda handles all, routes internally by path+method
    const v1 = api.root.addResource('v1');

    const addCrud = (name: string, withId = true) => {
      const r = v1.addResource(name);
      r.addMethod('GET',  integration, auth);
      r.addMethod('POST', integration, auth);
      if (withId) {
        const detail = r.addResource(`{${name.replace(/s$/, '')}Id}`);
        detail.addMethod('GET',    integration, auth);
        detail.addMethod('PUT',    integration, auth);
        detail.addMethod('DELETE', integration, auth);
      }
    };

    addCrud('sites');
    addCrud('assets');
    addCrud('devices');
    addCrud('alerts',  false);
    addCrud('tickets');

    // Telemetry is read-only from the API (writes come via IoT Core)
    const telemetry = v1.addResource('telemetry');
    telemetry.addMethod('GET', integration, auth);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
