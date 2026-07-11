import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';

// Test Strategy §5 — CDK assertion tests. Not "does it synth" (cdk-nag +
// ci.yml's infra-synth job already gates that on every PR); these check
// that specific, deliberately-made architecture decisions are actually
// present in the synthesized template. `cdk-nag` catches best-practice
// drift; nothing before this caught a *decision* silently reverting (e.g.
// someone flips Mfa.REQUIRED back to OPTIONAL and every check still passes,
// since OPTIONAL isn't itself a cdk-nag finding).

describe('AuthStack — MFA enforcement (Security Architecture §2.2)', () => {
  it('requires MFA pool-wide, not per-role', () => {
    const app = new cdk.App();
    const stack = new AuthStack(app, 'TestAuth', {
      env: { account: '123456789012', region: 'us-east-1' },
      tags: {},
      stage: 'dev',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'ON',
    });
  });
});

describe('DataStack — stage-conditional HA settings (Deployment Architecture §3.1)', () => {
  function synthDataStack(stage: string) {
    const app = new cdk.App();
    const env = { account: '123456789012', region: 'us-east-1' };
    const network = new NetworkStack(app, `TestNetwork-${stage}`, { env, tags: {}, stage });
    const data = new DataStack(app, `TestData-${stage}`, { env, tags: {}, network, stage });
    return Template.fromStack(data);
  }

  it('dev: Multi-AZ off, deletion protection off, t3.micro', () => {
    const template = synthDataStack('dev');
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: false,
      DeletionProtection: false,
      DBInstanceClass: 'db.t3.micro',
    });
  });

  it('prod: Multi-AZ on, deletion protection on, t3.medium', () => {
    const template = synthDataStack('prod');
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: true,
      DeletionProtection: true,
      DBInstanceClass: 'db.t3.medium',
    });
  });

  it('dev: exactly 1 NAT gateway; prod: 2, one per AZ', () => {
    // Two separate App instances, not one shared — Template.fromStack()
    // synthesizes the whole app and locks its construct tree; a second
    // `new StackX(app, ...)` on an already-synthesized app throws
    // ConstructTreeModifiedAfterSynth (found by actually running this test,
    // not assumed). Each stage needs its own App, same pattern already used
    // by synthDataStack() above.
    const env = { account: '123456789012', region: 'us-east-1' };

    const devApp = new cdk.App();
    const devNetwork = new NetworkStack(devApp, 'TestNetworkDevNat', { env, tags: {}, stage: 'dev' });
    Template.fromStack(devNetwork).resourceCountIs('AWS::EC2::NatGateway', 1);

    const prodApp = new cdk.App();
    const prodNetwork = new NetworkStack(prodApp, 'TestNetworkProdNat', { env, tags: {}, stage: 'prod' });
    Template.fromStack(prodNetwork).resourceCountIs('AWS::EC2::NatGateway', 2);
  });
});
