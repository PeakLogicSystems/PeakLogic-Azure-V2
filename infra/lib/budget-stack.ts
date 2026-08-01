// ⚠️ DEPRECATED — pre-pivot AWS CDK. NOT deployed, NOT referenced by CI or the
// backend. PeakLogic runs on Azure; live infrastructure is Bicep in infra-azure/.
// Retained as read-only historical reference only — see infra/README.md.

import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { DataStack } from './data-stack';

interface BudgetStackProps extends cdk.StackProps {
  data: DataStack;
  stage: string;
}

// Cost kill switch — user's explicit request, 2026-07-15: "very worried
// about incurring unplanned charges once we deploy." Uses AWS's native
// Budget Actions feature (no custom Lambda) rather than hand-rolled
// shutdown code — officially supported, nothing here to maintain/debug.
//
// IMPORTANT, disclosed limitations, not hidden:
// 1. AWS Budgets tracks *account-wide* spend, not per-stage spend — a
//    budget isn't natively scoped to "just the dev stage." This stack is
//    still deployed per-stage (it needs a specific stage's RDS instance
//    ID to target), so if more than one stage is ever deployed
//    simultaneously, multiple BudgetStacks would each be watching the
//    *same* total account cost. Fine under this project's current
//    single-stage-at-a-time reality (Deployment Architecture §2's own
//    IoT-topic-collision rule already assumes this); would need real
//    thought (cost-allocation tags + a filtered budget) before ever
//    running two stages in one account at once.
// 2. Billing data has reporting lag — AWS Cost Explorer/Budgets data is
//    typically updated a few times a day, not in real time. This is a
//    strong, fast first response, not an instantaneous circuit breaker.
// 3. Stopping RDS via a Budget Action is still subject to RDS's own
//    platform rule that a stopped instance auto-restarts after 7 days —
//    this action buys a strong pause, not a permanent shutdown. If the
//    underlying cost driver isn't fixed within 7 days, the instance
//    comes back and can resume billing.
// 4. Every other billable piece of this architecture (Lambda, API
//    Gateway, CloudFront, S3, Cognito, IoT Core) is already pay-per-use
//    with nothing to "stop" — RDS is the one resource that bills hourly
//    regardless of usage, which is why it's the sole automated target
//    here rather than trying to build a generic "stop everything" action.
export class BudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    // Required, not optional with a silent no-op fallback — a budget
    // action's `subscribers` list must have at least one entry, and an
    // unconfigured kill switch that silently does nothing is worse than a
    // loud failure at synth time telling you to set it (same "fail loudly
    // on a missing required value" discipline as `-c stage=`).
    const alertEmail = this.node.tryGetContext('budgetAlertEmail') as string | undefined;
    if (!alertEmail) {
      throw new Error(
        'Missing required context "budgetAlertEmail" for BudgetStack. ' +
        'Pass -c budgetAlertEmail=you@example.com — the cost kill switch ' +
        'needs a real notification target, not a silent no-op.',
      );
    }

    const limitUsd = Number(this.node.tryGetContext('budgetLimitUsd') ?? 5);
    const budgetName = `peaklogic-${props.stage}-cost-guard`;

    const budget = new budgets.CfnBudget(this, 'CostBudget', {
      budget: {
        budgetName,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: limitUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        // Early heads-up, well before the hard stop below — gives you a
        // chance to look and decide manually before automation takes over.
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: alertEmail }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: alertEmail }],
        },
      ],
    });

    // Execution role the Budgets service assumes to actually run the stop —
    // AWS's own documented managed policy for exactly this purpose, not a
    // custom-written policy this project would have to keep correct itself.
    const actionRole = new iam.Role(this, 'BudgetActionRole', {
      assumedBy: new iam.ServicePrincipal('budgets.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM',
        ),
      ],
    });

    // The kill switch itself: stop the RDS instance automatically once
    // ACTUAL spend crosses 100% of the limit. AUTOMATIC approval (not
    // MANUAL) per the user's explicit choice — prioritizing a hard,
    // unattended stop over risking a missed notification.
    const stopAction = new budgets.CfnBudgetsAction(this, 'StopRdsAction', {
      budgetName,
      actionType: 'RUN_SSM_DOCUMENTS',
      actionThreshold: {
        type: 'PERCENTAGE',
        value: 100,
      },
      definition: {
        ssmActionDefinition: {
          subtype: 'STOP_RDS_INSTANCES',
          instanceIds: [props.data.dbInstance.instanceIdentifier],
          region: this.region,
        },
      },
      executionRoleArn: actionRole.roleArn,
      approvalModel: 'AUTOMATIC',
      notificationType: 'ACTUAL',
      // Note the field name here is `type`, not `subscriptionType` the way
      // CfnBudget.SubscriberProperty (used above for the plain budget
      // notifications) is — a real inconsistency between the two
      // CloudFormation resource types, caught by `cdk synth` failing to
      // compile, not by reading the docs.
      subscribers: [{ type: 'EMAIL', address: alertEmail }],
    });

    // budgetName is a plain string, not a CDK token — CDK can't infer this
    // ordering dependency automatically the way it does for the roleArn
    // reference above, so it's declared explicitly: the action references
    // a budget by name, so the budget must exist first.
    stopAction.addDependency(budget);

    // cdk-nag suppression (Infrastructure as Code §2.2) — a reviewed,
    // deliberate decision, not a blanket silence. AwsSolutions-IAM4 flags
    // any AWS-managed policy on principle, but this specific policy is
    // AWS's own documented, purpose-built role policy for exactly this
    // feature (Budget Actions running SSM stop-instance documents) —
    // hand-rolling an equivalent customer-managed policy would mean
    // independently re-deriving the correct SSM/RDS permission scope for a
    // security-sensitive automated action, with real risk of getting it
    // subtly wrong (too broad, or too narrow to actually work when it's
    // needed). Using AWS's own maintained policy is the more defensible
    // choice here, not less.
    NagSuppressions.addResourceSuppressions(actionRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: "AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM is AWS's own documented managed policy for Budget Actions execution roles — the officially supported mechanism for this exact feature, not generic scaffolding. Hand-rolling an equivalent risks mis-scoping a security-sensitive automated stop action.",
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM',
        ],
      },
    ]);

    new cdk.CfnOutput(this, 'BudgetName', { value: budgetName });
    new cdk.CfnOutput(this, 'BudgetLimitUsd', { value: String(limitUsd) });
  }
}
