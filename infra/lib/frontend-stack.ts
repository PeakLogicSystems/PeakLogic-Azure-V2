import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface FrontendStackProps extends cdk.StackProps {
  stage: string;
  certificate: acm.ICertificate; // from DomainStack — us-east-1, covers appDomain (+ domainRoot/www, unused here)
  appDomain: string;             // e.g. app.peaklogicsolutions.com — real domain, replacing the
                                   // app.peaklogic.io placeholder allowed-origins.ts referenced before
                                   // any real domain existed for this project
}

export class FrontendStack extends cdk.Stack {
  public readonly bucketName: string;
  public readonly distributionUrl: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Access-log target for both the frontend bucket's own server access
    // logs (cdk-nag AwsSolutions-S1) and CloudFront's access logs
    // (AwsSolutions-CFR3) — closes the "who accessed the frontend" forensic
    // gap Security Architecture §6 didn't have a source for. Unverified
    // against a real deploy — CloudFront's log-delivery permission grant to
    // this bucket has historically had ACL quirks; confirm at first real
    // deploy (Deployment Architecture §4.3's standing "nothing has ever
    // actually deployed" caveat applies here too).
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });

    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, // cdk-nag AwsSolutions-S10
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `frontend-bucket/${props.stage}/`,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [props.appDomain],
      certificate: props.certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      defaultRootObject: 'index.html',
      // SPA fallback — 404 → serve index.html so React Router handles the route
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US + Europe only — cheapest
      logBucket: accessLogsBucket,
      logFilePrefix: `cloudfront/${props.stage}/`,
      // FIXED (Infrastructure as Code §2.2/§6, TD-10 — was open pending real
      // domain ownership, now resolved): a real custom domain
      // (peaklogicsolutions.com, purchased via Cloudflare) + DomainStack's
      // ACM certificate exist now, so TLS 1.0/1.1 no longer need to stay
      // allowed the way CloudFront's shared default certificate forced them
      // to when this distribution had no custom domain of its own.
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    this.bucketName = bucket.bucketName;
    this.distributionUrl = `https://${distribution.distributionDomainName}`;

    new cdk.CfnOutput(this, 'BucketName',       { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId',   { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionUrl',  { value: this.distributionUrl });
    new cdk.CfnOutput(this, 'CloudflareDnsInstructions', {
      value: `Add a CNAME in Cloudflare (DNS only / grey-cloud, not proxied): ${props.appDomain} -> ` +
        `${distribution.distributionDomainName}`,
    });

    // cdk-nag suppressions (Infrastructure as Code §2.2). AwsSolutions-CFR4
    // (TLS 1.0 allowed) no longer needs a suppression here at all — it's
    // genuinely fixed above (minimumProtocolVersion), not just excused;
    // removed rather than left as a stale, now-inapplicable entry (TD-10,
    // Technical Debt Register — closed by this change).
    NagSuppressions.addResourceSuppressions(distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'No regulatory or business requirement to geo-restrict the product today — PRICE_CLASS_100 already limits edge locations to US/Europe for cost, a different concern from access control. Revisit if a specific compliance requirement emerges.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason: 'WAF: same decision as Security Architecture §3.3 and api-stack.ts\'s APIG3 suppression — not worth the marginal benefit yet at current scale.',
      },
    ]);
  }
}
