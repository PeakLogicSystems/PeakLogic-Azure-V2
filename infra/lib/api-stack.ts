import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { NetworkStack } from './network-stack';
import { DataStack } from './data-stack';
import { AuthStack } from './auth-stack';
import { ALLOWED_ORIGINS } from './allowed-origins';

interface ApiStackProps extends cdk.StackProps {
  network: NetworkStack;
  data: DataStack;
  auth: AuthStack;
  stage: string;
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

    const commonProps: Omit<lambdaNode.NodejsFunctionProps, 'entry' | 'functionName' | 'logGroup'> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc: props.network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.network.lambdaSg],
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      // Entry files live in ../backend, outside this CDK app's own directory —
      // NodejsFunction's default projectRoot/lockfile auto-detection can't see
      // past infra/, so both must be pointed at backend/ explicitly, or bundling
      // fails with "entryPath should be under projectRoot" (found while
      // validating the Security Architecture §4.2 fix below — pre-existing and
      // unrelated to it; cdk synth had apparently never been run successfully).
      projectRoot: path.join(__dirname, '../../backend'),
      depsLockFilePath: path.join(__dirname, '../../backend/package-lock.json'),
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node20',
        // Copy the RDS CA bundle into the Lambda package so db.ts can validate
        // the Postgres TLS cert at runtime (Security Architecture §4.2) — esbuild
        // only bundles JS it can trace from imports, not static files like this.
        commandHooks: {
          beforeBundling(): string[] { return []; },
          beforeInstall(): string[] { return []; },
          afterBundling(_inputDir: string, outputDir: string): string[] {
            const certSrc = path.join(__dirname, '../../backend/shared/certs/rds-global-bundle.pem');
            return [`cp "${certSrc}" "${outputDir}"`];
          },
        },
      },
    };

    // Explicit LogGroup per function, not the deprecated `logRetention` prop
    // (Infrastructure as Code §2.1 — cdk-nag AwsSolutions-L1/IAM5 both flagged
    // it: `logRetention` provisions a custom-resource Lambda with a wildcard
    // IAM policy to set retention after the fact, deprecated by CDK itself).
    const ingestLogGroup = new logs.LogGroup(this, 'IngestFnLogGroup', {
      logGroupName: `/aws/lambda/peaklogic-${props.stage}-ingest`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const apiLogGroup = new logs.LogGroup(this, 'ApiFnLogGroup', {
      logGroupName: `/aws/lambda/peaklogic-${props.stage}-api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Ingest Lambda (called directly by IoT Core rule) ──────────────────
    const ingestFn = new lambdaNode.NodejsFunction(this, 'IngestFn', {
      ...commonProps,
      functionName: `peaklogic-${props.stage}-ingest`,
      logGroup: ingestLogGroup,
      entry: path.join(__dirname, '../../backend/ingest/handler.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    props.data.dbSecret.grantRead(ingestFn);
    this.ingestFn = ingestFn;

    // ── API Lambda (all REST routes, path-routed internally) ──────────────
    const apiFn = new lambdaNode.NodejsFunction(this, 'ApiFn', {
      ...commonProps,
      functionName: `peaklogic-${props.stage}-api`,
      logGroup: apiLogGroup,
      entry: path.join(__dirname, '../../backend/api/handler.ts'),
      handler: 'handler',
      environment: {
        ...commonEnv,
        USER_POOL_ID: props.auth.userPool.userPoolId,
      },
    });
    props.data.dbSecret.grantRead(apiFn);

    // Structured access log — distinct from the executionLogging above
    // (loggingLevel/dataTraceEnabled trace request handling for debugging;
    // this is the who-called-what-when record cdk-nag's AwsSolutions-APIG1
    // flagged as missing, and Security Architecture §6 needs as a forensic
    // source alongside Lambda's own logs).
    const apiAccessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      logGroupName: `/peaklogic/${props.stage}/api/access-logs`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── API Gateway ────────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `peaklogic-${props.stage}-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS, // Security Architecture §3.2 — was Cors.ALL_ORIGINS
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'v1', // API version prefix (/v1/...), unrelated to the dev/staging/prod deployment stage above
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        throttlingBurstLimit: 200,
        throttlingRateLimit: 100,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiAccessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
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
    addCrud('alerts');
    addCrud('tickets');

    // Telemetry is read-only from the API (writes come via IoT Core)
    const telemetry = v1.addResource('telemetry');
    telemetry.addMethod('GET', integration, auth);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });

    // RDS secret rotation is wired up in data-stack.ts, not here — see that
    // file for why (two failed attempts here first, both hitting a real
    // CloudFormation cross-stack dependency cycle for structural reasons
    // that only got fixed by moving rdsSg itself out of NetworkStack).

    // cdk-nag suppressions (Infrastructure as Code §2.2) — each is a reviewed,
    // deliberate decision, not a blanket silence. Re-litigate the reason, not
    // just the rule ID, if a finding reappears after this stack changes.
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS-managed execution-role policies (Lambda basic + VPC access, API Gateway push-to-CloudWatch) are standard CDK scaffolding for every VPC Lambda and every logging-enabled REST API — replacing them with hand-rolled equivalents duplicates an AWS-maintained baseline for no real security gain.',
      },
      {
        id: 'AwsSolutions-APIG2',
        reason: 'Every route already validates its own inputs in the Lambda handler (see backend/api/routes/*.ts — e.g. badRequest() calls) before touching the database. API Gateway-level request validation would be redundant defense-in-depth, not a real gap; revisit only if a specific need for earlier-stage rejection emerges.',
      },
      {
        id: 'AwsSolutions-APIG3',
        reason: 'WAF: already decided against for now in Security Architecture §3.3 — marginal benefit unclear at current design-partner-tenant scale with Cognito auth + throttling already in place. Revisit alongside Threat Model (#19) or sooner if a specific enterprise deal requires it.',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'NODEJS_20_X is still an actively supported LTS runtime. Bumping to a newer runtime is a deliberate future upgrade (also requires updating esbuild\'s bundling target in this same file) — not done reactively to a linter finding alone, tracked as an open item instead.',
      },
    ]);
  }
}
