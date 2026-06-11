#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack }  from '../lib/network-stack';
import { DataStack }     from '../lib/data-stack';
import { AuthStack }     from '../lib/auth-stack';
import { ApiStack }      from '../lib/api-stack';
import { IoTStack }      from '../lib/iot-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const tags = { Project: 'PeakLogic', ManagedBy: 'CDK' };

const network  = new NetworkStack (app, 'PeakLogic-Network',  { env, tags });
const data     = new DataStack    (app, 'PeakLogic-Data',     { env, tags, network });
const auth     = new AuthStack    (app, 'PeakLogic-Auth',     { env, tags });
const api      = new ApiStack     (app, 'PeakLogic-Api',      { env, tags, network, data, auth });
                 new IoTStack     (app, 'PeakLogic-IoT',      { env, tags, ingestFn: api.ingestFn });
                 new FrontendStack(app, 'PeakLogic-Frontend', { env, tags });
