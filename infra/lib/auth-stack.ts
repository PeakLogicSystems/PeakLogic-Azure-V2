import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

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
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // RBAC groups — maps to role claim in JWT
    for (const group of ['admin', 'operator', 'service_partner']) {
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
        // Add your production domain when ready
        callbackUrls: ['http://localhost:5173', 'https://app.peaklogic.io'],
        logoutUrls:   ['http://localhost:5173', 'https://app.peaklogic.io'],
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
