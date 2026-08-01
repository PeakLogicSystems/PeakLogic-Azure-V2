// ⚠️ DEPRECATED — pre-pivot AWS CDK. NOT deployed, NOT referenced by CI or the
// backend. PeakLogic runs on Azure; live infrastructure is Bicep in infra-azure/.
// Retained as read-only historical reference only — see infra/README.md.

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

interface MarketingStackProps extends cdk.StackProps {
  stage: string;
  certificate: acm.ICertificate; // from DomainStack — us-east-1, covers domainRoot + www + app
  domainRoot: string;
  wwwDomain: string;
}

// The public marketing site — deliberately a SEPARATE stack/bucket/
// distribution from FrontendStack (the authenticated tenant app). A
// "Coming Soon" splash page today, the real marketing site later; either
// way this is public, unauthenticated, static content with a completely
// different content lifecycle from the app (marketing copy changes on its
// own schedule, has nothing to do with app releases) — sharing one
// distribution between the two would couple two things that should stay
// independent, the same reasoning that already keeps the tenant/partner/
// staff identity pools structurally separate elsewhere in this codebase.
export class MarketingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MarketingStackProps) {
    super(scope, id, props);

    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });

    const bucket = new s3.Bucket(this, 'MarketingBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `marketing-bucket/${props.stage}/`,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      // Both the apex and www resolve to the same content — no redirect
      // function needed for a static splash page; add one later only if
      // canonicalizing to a single URL for SEO actually matters once the
      // real site ships.
      domainNames: [props.domainRoot, props.wwwDomain],
      certificate: props.certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021, // real custom cert now exists — no reason to allow TLS 1.0 the way frontend-stack.ts's default-cert distribution had to (Infrastructure as Code, TD-10)
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      logBucket: accessLogsBucket,
      logFilePrefix: `cloudfront/${props.stage}/`,
    });

    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'CloudflareDnsInstructions', {
      value: `Add CNAME records in Cloudflare (DNS only / grey-cloud, not proxied, so ACM/CloudFront ` +
        `see the real target): ${props.domainRoot} -> ${distribution.distributionDomainName}, ` +
        `${props.wwwDomain} -> ${distribution.distributionDomainName}. (Cloudflare requires a CNAME ` +
        `flattening/ALIAS-style record for the apex specifically — a plain CNAME at the zone apex ` +
        `isn't standard DNS; Cloudflare's dashboard offers this automatically when you add a CNAME ` +
        `at the root.)`,
    });

    NagSuppressions.addResourceSuppressions(distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'No regulatory or business requirement to geo-restrict a public marketing site.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason: 'WAF: same decision as every other CloudFront distribution in this project (Security Architecture §3.3) — not worth the marginal benefit yet at current scale.',
      },
    ]);
  }
}
