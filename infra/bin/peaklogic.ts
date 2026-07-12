#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { NetworkStack }  from '../lib/network-stack';
import { DataStack }     from '../lib/data-stack';
import { AuthStack }     from '../lib/auth-stack';
import { ApiStack }      from '../lib/api-stack';
import { IoTStack }      from '../lib/iot-stack';
import { DomainStack }   from '../lib/domain-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MarketingStack } from '../lib/marketing-stack';
import { CiCdStack }     from '../lib/cicd-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

// Infrastructure as Code §2 — automated best-practice/compliance checking on
// every synth, not just manual review. Findings are annotations on the synth
// output (or hard errors with `-c nagFail=true` — not enabled by default so
// a first adoption pass isn't immediately blocking); see NagSuppressions
// calls in each stack for findings reviewed and deliberately accepted.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Deployment Architecture §2 — required, no default. Every stack name and
// every account+region-unique resource name (Lambda functions, the REST API,
// the Cognito user pool, IoT thing type/policy/rule/log group) is suffixed by
// this so dev/staging/prod can coexist in one AWS account without collision.
// Missing it fails the synth rather than silently deploying somewhere
// unintended — the safer failure mode, given the reverse (dev config
// deployed to what someone thought was prod) is worse.
const stage = app.node.tryGetContext('stage') as string | undefined;
const VALID_STAGES = ['dev', 'staging', 'prod'];
if (!stage || !VALID_STAGES.includes(stage)) {
  throw new Error(
    `Missing or invalid required context "stage" (got: ${stage ?? '<none>'}). ` +
    `Pass one of ${VALID_STAGES.join('/')} explicitly, e.g. -c stage=dev`,
  );
}

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const tags = { Project: 'PeakLogic', ManagedBy: 'CDK', Stage: stage };

const network  = new NetworkStack (app, `PeakLogic-${stage}-Network`,  { env, tags, stage });
const data     = new DataStack    (app, `PeakLogic-${stage}-Data`,     { env, tags, network, stage });
const auth     = new AuthStack    (app, `PeakLogic-${stage}-Auth`,     { env, tags, stage });
const api      = new ApiStack     (app, `PeakLogic-${stage}-Api`,      { env, tags, network, data, auth, stage });
                 new IoTStack     (app, `PeakLogic-${stage}-IoT`,      { env, tags, ingestFn: api.ingestFn, stage });

// peaklogicsolutions.com (purchased via Cloudflare) — DomainStack always
// deploys to us-east-1 regardless of `env` (ACM/CloudFront requirement,
// see domain-stack.ts), and owns the one shared certificate both
// FrontendStack and MarketingStack consume below.
const domain     = new DomainStack   (app, `PeakLogic-${stage}-Domain`, { env, tags, stage });
                    new FrontendStack(app, `PeakLogic-${stage}-Frontend`, {
                      env, tags, stage,
                      certificate: domain.certificate,
                      appDomain: domain.appDomain,
                    });
                    new MarketingStack(app, `PeakLogic-${stage}-Marketing`, {
                      env, tags, stage,
                      certificate: domain.certificate,
                      domainRoot: domain.domainRoot,
                      wwwDomain: domain.wwwDomain,
                    });

                 new CiCdStack    (app, `PeakLogic-${stage}-CiCd`,     { env, tags, stage });
                 new MonitoringStack(app, `PeakLogic-${stage}-Monitoring`, { env, tags, api, data, stage });
