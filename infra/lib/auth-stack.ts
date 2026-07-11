import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { ALLOWED_ORIGINS } from './allowed-origins';

interface AuthStackProps extends cdk.StackProps {
  stage: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly partnerPool: cognito.UserPool;
  public readonly partnerPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `peaklogic-${props.stage}-users`,
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
      userPoolClientName: `peaklogic-${props.stage}-spa`,
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

    // cdk-nag suppression (Infrastructure as Code §2.2).
    NagSuppressions.addResourceSuppressions(this.userPool, [
      {
        id: 'AwsSolutions-COG8',
        reason: 'Plus tier (compromised-credential checking, adaptive auth) is a real, paid feature-tier upgrade, not a config flag — a cost/feature tradeoff appropriate to defer at design-partner-tenant scale, same reasoning already applied to WAF (Security Architecture §3.3) and Cognito Plus is a materially bigger recurring cost than a WAF web ACL. Revisit alongside a real enterprise deal or SOC 2 Type II engagement.',
      },
    ]);

    // ── Channel Partner Portal Pool (Security Architecture §2.4, added v1.1) ──
    // A genuinely separate identity space from the tenant pool above, not a
    // second set of groups in the same pool — a ChannelPartnerUser is not a
    // Tenant User (Domain Model §2.7), has no tenant_id, and this pool's own
    // custom:channel_partner_id claim would be meaningless/dangerous to mix
    // into the same claims shape getAuth() already parses for tenant sessions.
    // No Cognito groups here (contrast the tenant pool's admin/operator
    // groups above) — role (partner_admin vs technician) is resolved from
    // channel_partner_users.role at request time in withChannelPartner()
    // (backend/shared/db.ts), not from a Cognito claim. That table is already
    // the source of truth for territory/route scoping, so deriving role from
    // the same query avoids a second, independently-driftable source of
    // truth for authorization — a deliberate difference from the tenant
    // pool's pattern, not an oversight.
    this.partnerPool = new cognito.UserPool(this, 'PartnerPool', {
      userPoolName: `peaklogic-${props.stage}-partners`,
      selfSignUpEnabled: false,       // partner_admin-provisioned only (Domain Model §4 decision 8) — no self-service signup
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email:    { required: true,  mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        channel_partner_id: new cognito.StringAttribute({ mutable: false }),
      },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.REQUIRED, // same decision as the tenant pool (§2.2) — no reason to weaken this for a second pool
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.partnerPoolClient = this.partnerPool.addClient('PartnerSpaClient', {
      userPoolClientName: `peaklogic-${props.stage}-partner-spa`,
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        // Reuses the same origin list as the tenant SPA client — the partner
        // portal frontend doesn't exist yet (Implementation, project memory),
        // so there is no separate URL to point at today. Revisit once it's
        // built, likely a distinct route on the same app rather than a
        // separate deployment.
        callbackUrls: ALLOWED_ORIGINS,
        logoutUrls:   ALLOWED_ORIGINS,
      },
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    new cdk.CfnOutput(this, 'PartnerPoolId',       { value: this.partnerPool.userPoolId });
    new cdk.CfnOutput(this, 'PartnerPoolClientId', { value: this.partnerPoolClient.userPoolClientId });

    NagSuppressions.addResourceSuppressions(this.partnerPool, [
      {
        id: 'AwsSolutions-COG8',
        reason: 'Same reasoning as the tenant pool above (Security Architecture §3.3/§2.2) — Plus tier is a paid upgrade disproportionate at design-partner-tenant scale.',
      },
    ]);
  }
}
