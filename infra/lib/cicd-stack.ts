import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface CiCdStackProps extends cdk.StackProps {
  stage: string;
}

const GITHUB_ORG_REPO = 'PeakLogicSystems/PeakLogic-Azure';
const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';

// CI/CD Pipeline §4 — GitHub Actions authenticates via OIDC federation, not
// long-lived AWS access keys stored as repo secrets. Continues the same
// "avoid long-lived credentials where a short-lived alternative exists"
// posture as Infrastructure as Code §2.3's RDS rotation and Security
// Architecture's secrets-management sections.
export class CiCdStack extends cdk.Stack {
  public readonly deployRoleArn: string;

  constructor(scope: Construct, id: string, props: CiCdStackProps) {
    super(scope, id, props);

    // The OIDC provider is a single, account-wide IAM resource — CloudFormation
    // fails on a duplicate, so exactly one stage's stack may create it. `dev`
    // is the stage every account deploys first, so it owns creation; staging/
    // prod import it by its deterministic ARN (computable from the account ID
    // alone — no cross-stack reference needed) instead of creating their own.
    // Real, undiscoverable-from-here risk (CI/CD Pipeline §7): if some other
    // project in this AWS account already created a GitHub OIDC provider for
    // an unrelated reason, dev's deploy fails outright on this line — check
    // `aws iam list-open-id-connect-providers` before the first real deploy.
    const provider = props.stage === 'dev'
      ? new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
          url: GITHUB_OIDC_URL,
          clientIds: ['sts.amazonaws.com'],
        })
      : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidcProvider',
          `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
        );

    // Trust condition scopes which GitHub Actions workflow runs may assume
    // this role — deliberately narrow per stage so a dev-branch workflow
    // token can never assume prod's role, even though every stage's role
    // trusts the same OIDC provider.
    // - dev: only workflow runs triggered by a push to the dev branch itself.
    // - staging: only manual workflow_dispatch runs (CI/CD Pipeline §3 — no
    //   branch maps to staging in the current two-branch git model), which
    //   GitHub's OIDC token represents as ref:refs/heads/main (workflow_dispatch
    //   always runs against whichever ref was selected, main by default here).
    // - prod: scoped to the GitHub *Environment* name, not a ref — only a
    //   workflow run that explicitly declared `environment: prod` in its job
    //   presents a token with this claim. Required-reviewer protection rules
    //   on that environment were tested directly and confirmed NOT available
    //   on this repo's billing tier (real 422, not an assumption — CI/CD
    //   Pipeline §2.3/§7 item 1), so this claim alone is the scoping that
    //   exists today, not a proxy for "a human approved this" — the actual
    //   human gate is deploy-prod.yml being workflow_dispatch-only.
    const subClaim = props.stage === 'prod'
      ? `repo:${GITHUB_ORG_REPO}:environment:prod`
      : props.stage === 'dev'
        ? `repo:${GITHUB_ORG_REPO}:ref:refs/heads/dev`
        : `repo:${GITHUB_ORG_REPO}:ref:refs/heads/main`;

    const deployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: `peaklogic-${props.stage}-github-actions-deploy`,
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': subClaim,
        },
      }),
      description: `Assumed by GitHub Actions to deploy the ${props.stage} stage — scoped to CDK's own bootstrap roles only, not direct account permissions.`,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Minimal-privilege by design: this role only gets permission to BECOME
    // CDK's own bootstrap-created deploy/publishing roles (created once per
    // account/region by `cdk bootstrap`, an operational prerequisite — CI/CD
    // Pipeline §7 item 2, not yet run against a real account) — not direct
    // CloudFormation/S3/IAM permissions itself. Those bootstrap roles already
    // carry the broad permissions `cdk deploy` needs; this role just needs to
    // assume them, scoped to this one stage's role ARNs.
    const qualifier = 'hnb659fds'; // CDK's default bootstrap qualifier — unchanged from default anywhere in this repo
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-${qualifier}-deploy-role-${this.account}-${this.region}`,
        `arn:aws:iam::${this.account}:role/cdk-${qualifier}-file-publishing-role-${this.account}-${this.region}`,
        `arn:aws:iam::${this.account}:role/cdk-${qualifier}-lookup-role-${this.account}-${this.region}`,
      ],
    }));

    this.deployRoleArn = deployRole.roleArn;

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: this.deployRoleArn });
  }
}
