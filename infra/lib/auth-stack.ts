import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { ALLOWED_ORIGINS } from './allowed-origins';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'peaklogic-users',
      selfSignUpEnabled: false,       // admin-invited only
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email:    { required: true,  mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        tenant_id: new cognito.StringAttribute({ mutable: false }),
        role:      new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.REQUIRED, // Security Architecture §2.2 — pool-wide, not per-role (see doc for reasoning)
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // RBAC groups — maps to role claim in JWT.
    // 'service_partner' removed per Security Architecture §2.3: no route ever
    // checked for it, and because read handlers have no role check at all, a
    // user placed in it would have gotten full tenant-data read access by
    // accident. The Field Service Partner persona uses the no-login opaque-token
    // pattern (API Specification §5) instead of a Cognito account.
    for (const group of ['admin', 'operator']) {
      new cognito.CfnUserPoolGroup(this, `Group-${group}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
      });
    }

    // SPA client — no secret, PKCE flow
    this.userPoolClient = this.userPool.addClient('SpaClient', {
      userPoolClientName: 'peaklogic-spa',
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ALLOWED_ORIGINS,
        logoutUrls:   ALLOWED_ORIGINS,
      },
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    new cdk.CfnOutput(this, 'UserPoolId',       { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
  }
}
