import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface DomainStackProps extends cdk.StackProps {
  stage: string;
}

// Real domain (peaklogicsolutions.com, purchased via Cloudflare) replacing
// the app.peaklogic.io placeholder allowed-origins.ts/auth-stack.ts had
// referenced since before any AWS account existed for this project — see
// git history on allowed-origins.ts for the prior placeholder.
//
// DNS stays at Cloudflare (a deliberate choice, not a Route53 migration) —
// there is no Route53 HostedZone here, so this certificate uses plain DNS
// validation (`CertificateValidation.fromDns()` with no zone argument).
// CloudFormation will pend on this stack's deploy until the validation
// CNAME (visible in the ACM console the moment this stack starts creating
// the certificate, or via `aws acm describe-certificate`) is added manually
// in the Cloudflare dashboard and propagates — this is expected, not a
// deploy failure, and is the one real operational cost of not using
// Route53 (Route53 would let CDK auto-manage this validation record).
//
// One certificate, three SANs (apex, www, app) — not three separate
// certificates — so this manual DNS-validation step only has to happen
// once, not once per subdomain/stack.
export class DomainStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;
  public readonly domainRoot: string;
  public readonly wwwDomain: string;
  public readonly appDomain: string;

  constructor(scope: Construct, id: string, props: DomainStackProps) {
    // ACM certificates used by CloudFront MUST be in us-east-1, regardless
    // of which region the rest of the app deploys to — hardcoded here
    // rather than inherited from props.env, since that's an AWS platform
    // requirement, not a deployment preference this project's own
    // CDK_DEFAULT_REGION default should be trusted to coincidentally match.
    super(scope, id, { ...props, env: { ...props.env, region: 'us-east-1' } });

    // prod owns the real domain (peaklogicsolutions.com); dev/staging get
    // their own subdomain of it (dev.peaklogicsolutions.com), matching this
    // project's existing per-stage naming convention everywhere else
    // (peaklogic-dev-api, PeakLogic-dev-Api, etc.) rather than colliding on
    // the same public hostname across stages.
    this.domainRoot = props.stage === 'prod' ? 'peaklogicsolutions.com' : `${props.stage}.peaklogicsolutions.com`;
    this.wwwDomain = `www.${this.domainRoot}`;
    this.appDomain = `app.${this.domainRoot}`;

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: this.domainRoot,
      subjectAlternativeNames: [this.wwwDomain, this.appDomain],
      validation: acm.CertificateValidation.fromDns(),
    });

    new cdk.CfnOutput(this, 'CertificateArn', { value: this.certificate.certificateArn });
    new cdk.CfnOutput(this, 'ValidationInstructions', {
      value: 'This deploy will pend until DNS-validated. Find the required CNAME record(s) in the ' +
        'ACM console (us-east-1) or via: aws acm describe-certificate --region us-east-1 ' +
        '--certificate-arn <CertificateArn output above> — add each one to Cloudflare, then wait ' +
        'for propagation. The deploy resumes automatically once ACM sees the record.',
    });
  }
}
