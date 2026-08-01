// ⚠️ DEPRECATED — pre-pivot AWS CDK. NOT deployed, NOT referenced by CI or the
// backend. PeakLogic runs on Azure; live infrastructure is Bicep in infra-azure/.
// Retained as read-only historical reference only — see infra/README.md.

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { NetworkStack } from './network-stack';
import { DataStack } from './data-stack';
import { AuthStack } from './auth-stack';
import { getAllowedOrigins } from './allowed-origins';

interface ApiStackProps extends cdk.StackProps {
  network: NetworkStack;
  data: DataStack;
  auth: AuthStack;
  stage: string;
}

export class ApiStack extends cdk.Stack {
  public readonly ingestFn: lambda.IFunction;
  public readonly apiFn: lambda.IFunction;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Dev deliberately has no dbSecret (data-stack.ts's DEV_PLAINTEXT_DB_PASSWORD
    // path) — db.ts's getPool() branches on DB_PASSWORD being present (checked
    // before DB_SECRET_ARN) to skip the Secrets Manager call entirely, which
    // is what lets dev run with zero NAT gateways (network-stack.ts). Staging/
    // prod are unchanged: DB_SECRET_ARN only, no DB_PASSWORD ever set for them.
    const commonEnv = {
      ...(props.data.dbSecret
        ? { DB_SECRET_ARN: props.data.dbSecret.secretArn }
        : { DB_USER: 'peaklogic_admin', DB_PASSWORD: props.data.devPlaintextDbPassword! }),
      DB_HOST:  props.data.dbInstance.instanceEndpoint.hostname,
      DB_NAME:  'peaklogic',
      NODE_ENV: 'production',
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
        // Preserves the certs/ subdirectory (mkdir -p, not a flat copy) so the
        // relative path db.ts reads from is identical whether it's running
        // bundled here or unbundled from source (Vitest, ts-node) — a flat
        // copy previously meant db.ts could never be imported outside a full
        // CDK bundle, found while writing an integration test (Test Strategy §4).
        // commandHooks run through the OS's native shell (cmd.exe on Windows,
        // not Git Bash) — two real, sequential failures found by actually
        // running this on this Windows dev machine, not assumed:
        // (1) `mkdir -p`/`cp` aren't portable — cmd.exe's own mkdir doesn't
        //     understand -p at all, so a plain POSIX command string fails.
        // (2) A `node -e "..."` one-liner using JSON.stringify'd (i.e.
        //     double-quoted) path literals then broke too — cmd.exe doesn't
        //     support nested double quotes the way a POSIX shell does, so
        //     the inner quotes terminated the outer -e "..." string early.
        // Fixed by using single-quoted JS string literals with forward
        // slashes (Node's fs/path accept them on Windows too) instead of
        // JSON.stringify's double-quoted output — avoids the nested-quote
        // collision entirely rather than trying to escape around it.
        commandHooks: {
          beforeBundling(): string[] { return []; },
          beforeInstall(): string[] { return []; },
          afterBundling(_inputDir: string, outputDir: string): string[] {
            const toPosix = (p: string) => p.split(path.sep).join('/');
            const certSrc = toPosix(path.join(__dirname, '../../backend/shared/certs/rds-global-bundle.pem'));
            const certDest = toPosix(path.join(outputDir, 'certs', 'rds-global-bundle.pem'));
            const script =
              `const fs=require('fs'),path=require('path');` +
              `fs.mkdirSync(path.dirname('${certDest}'),{recursive:true});` +
              `fs.copyFileSync('${certSrc}','${certDest}');`;
            return [`node -e "${script}"`];
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
    props.data.dbSecret?.grantRead(ingestFn); // no-op for dev — no secret exists to grant read on
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
        PARTNER_POOL_ID: props.auth.partnerPool.userPoolId,
        STAFF_POOL_ID: props.auth.staffPool.userPoolId,
      },
    });
    props.data.dbSecret?.grantRead(apiFn); // no-op for dev — no secret exists to grant read on
    this.apiFn = apiFn;

    // API Specification §4.5 — POST /v1/partner/users provisions a real
    // Cognito account (AdminCreateUserCommand), not just a database row.
    // Scoped to exactly the one admin action this route needs, not a
    // blanket Cognito grant.
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser'],
      resources: [props.auth.partnerPool.userPoolArn],
    }));

    // API Specification §4.7/§4.8, added v1.2 — POST /v1/settings/team and
    // POST /v1/admin/tenants/{tenantId}/users both provision real userPool
    // Cognito accounts and assign the admin/operator group; POST
    // /v1/admin/staff-users does the same against staffPool for
    // superadmin/account_manager. AdminAddUserToGroup wasn't needed for the
    // partnerPool grant above since PartnerPool deliberately carries no
    // Cognito groups (Security Architecture §2.4) — the tenant and staff
    // pools both do, so both need it here.
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminAddUserToGroup'],
      resources: [props.auth.userPool.userPoolArn, props.auth.staffPool.userPoolArn],
    }));

    // GET/PUT /v1/settings/password and /v1/settings/mfa (routes/settings.ts)
    // proxy Cognito's own self-service ChangePassword/GetUser APIs using the
    // caller's own access token — no parallel credential store — but the
    // Lambda execution role still needs IAM permission for the underlying
    // API call itself, scoped to the tenant pool only (staff/partner users
    // have no settings endpoints).
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ChangePassword', 'cognito-idp:GetUser'],
      resources: [props.auth.userPool.userPoolArn],
    }));

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
        allowOrigins: getAllowedOrigins(props.stage), // Security Architecture §3.2 — was Cors.ALL_ORIGINS
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
    this.api = api;

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

    // ── Settings & Preferences (API Specification §4.8, added v1.2) ──
    // Tenant-pool authenticated — the existing `auth` MethodOptions above,
    // no new authorizer (these are ordinary per-user preferences, not a new
    // identity surface).
    const settings = v1.addResource('settings');
    settings.addMethod('GET', integration, auth);
    settings.addMethod('PUT', integration, auth);
    settings.addResource('password').addMethod('PUT', integration, auth);
    settings.addResource('mfa').addMethod('GET', integration, auth);

    const settingsTeam = settings.addResource('team');
    settingsTeam.addMethod('GET', integration, auth);
    settingsTeam.addMethod('POST', integration, auth);
    const settingsTeamDetail = settingsTeam.addResource('{userId}');
    settingsTeamDetail.addMethod('PUT', integration, auth);
    settingsTeamDetail.addMethod('DELETE', integration, auth);

    // ── Channel Partner Portal routes (API Specification §4.5, added v1.1) ──
    // A second, separate Cognito authorizer bound to PartnerPool, not the
    // tenant userPool authorizer above — Security Architecture §2.4 built
    // the pool but deliberately left it unattached to any route, since none
    // existed yet. Same apiFn Lambda handles both — backend/api/handler.ts
    // branches on event.resource to pick getAuth()/route() (tenant) vs.
    // getPartnerAuth()/partnerRoute() (partner), the same single-Lambda,
    // internally-routed pattern already used for every other endpoint.
    const partnerAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'PartnerAuthorizer', {
      cognitoUserPools: [props.auth.partnerPool],
      authorizerName: 'PartnerCognitoAuthorizer',
    });
    const partnerAuth: apigateway.MethodOptions = {
      authorizer: partnerAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const partner = v1.addResource('partner');
    partner.addMethod('GET', integration, partnerAuth);

    const partnerBranding = partner.addResource('branding');
    partnerBranding.addMethod('PUT', integration, partnerAuth);

    const addPartnerCrud = (name: string, options: { delete?: boolean } = {}) => {
      const { delete: allowDelete = true } = options;
      const r = partner.addResource(name);
      r.addMethod('GET',  integration, partnerAuth);
      r.addMethod('POST', integration, partnerAuth);
      const detail = r.addResource(`{${name.replace(/s$/, '')}Id}`);
      detail.addMethod('GET', integration, partnerAuth);
      detail.addMethod('PUT', integration, partnerAuth);
      if (allowDelete) detail.addMethod('DELETE', integration, partnerAuth);
      return { resource: r, detail };
    };

    addPartnerCrud('territories');
    addPartnerCrud('users');
    // Routes are deliberately not deletable (API Specification §4.5: a
    // confirmed route is immutable, re-plan by submitting a new one) —
    // review caught that addPartnerCrud's default DELETE method had been
    // wired here anyway with no corresponding handler in partner-router.ts,
    // an authenticated API Gateway method that only ever 404s.
    const { detail: routeDetail } = addPartnerCrud('routes', { delete: false });
    routeDetail.addResource('confirm').addMethod('POST', integration, partnerAuth);

    // ── Internal Administration Console routes (API Specification §4.7, added v1.2) ──
    // A third, separate Cognito authorizer bound to StaffPool — same
    // pattern as PartnerAuthorizer above. backend/api/handler.ts branches
    // on event.resource to pick getStaffAuth()/adminRoute() for anything
    // under /v1/admin, the same single-Lambda, internally-routed pattern
    // used for both other identity surfaces.
    const staffAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'StaffAuthorizer', {
      cognitoUserPools: [props.auth.staffPool],
      authorizerName: 'StaffCognitoAuthorizer',
    });
    const staffAuth: apigateway.MethodOptions = {
      authorizer: staffAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const adminResource = v1.addResource('admin');
    adminResource.addMethod('GET', integration, staffAuth);

    const adminTenants = adminResource.addResource('tenants');
    adminTenants.addMethod('GET', integration, staffAuth);
    adminTenants.addMethod('POST', integration, staffAuth);
    const adminTenantDetail = adminTenants.addResource('{tenantId}');
    adminTenantDetail.addMethod('GET', integration, staffAuth);

    // "Acting on a tenant" (IA-5.1) — nested under the same {tenantId},
    // reusing withStaffActingOnTenant() rather than a parallel resource tree.
    adminTenantDetail.addResource('users').addMethod('POST', integration, staffAuth);
    const adminTenantDevice = adminTenantDetail.addResource('devices').addResource('{deviceId}');
    adminTenantDevice.addMethod('PUT', integration, staffAuth);
    const adminTenantAsset = adminTenantDetail.addResource('assets').addResource('{assetId}');
    adminTenantAsset.addMethod('PUT', integration, staffAuth);
    const adminTenantAlert = adminTenantDetail.addResource('alerts').addResource('{alertId}');
    adminTenantAlert.addMethod('PUT', integration, staffAuth);

    const adminPartners = adminResource.addResource('channel-partners');
    adminPartners.addMethod('GET', integration, staffAuth);
    adminPartners.addMethod('POST', integration, staffAuth);
    adminPartners.addResource('{partnerId}').addMethod('GET', integration, staffAuth);

    const adminStaffUsers = adminResource.addResource('staff-users');
    adminStaffUsers.addMethod('GET', integration, staffAuth);
    adminStaffUsers.addMethod('POST', integration, staffAuth);

    const adminAssignments = adminResource.addResource('assignments');
    adminAssignments.addMethod('GET', integration, staffAuth);
    adminAssignments.addMethod('POST', integration, staffAuth);
    adminAssignments.addResource('{assignmentId}').addMethod('DELETE', integration, staffAuth);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'PartnerAuthorizerId', { value: partnerAuthorizer.authorizerId });
    new cdk.CfnOutput(this, 'StaffAuthorizerId', { value: staffAuthorizer.authorizerId });

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
