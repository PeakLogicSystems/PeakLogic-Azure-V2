// Water-Sector Security Hardening Strategy §5 Tier 2 item 3 — PSRule for
// Azure needs to actually EXPAND main.bicep (resolve every module, every
// conditional, every resource) to analyze the real resources it would
// create; it cannot do that for a template with required parameters and no
// values (verified against PSRule's own docs: "Bicep module files with
// required parameters will not be able be expanded... instead expand
// resources from deployments or tests" — a top-level template with
// unfilled required params hits the identical limitation).
//
// ⚠️ ANALYSIS-ONLY — NEVER A REAL DEPLOYMENT INPUT. The values below exist
// purely so `bicep build`/PSRule's own Bicep expansion can resolve this
// template's structure; they are never passed to a real `az deployment
// group create`, which supplies genuine values on the command line instead
// (CLAUDE.md's own documented deploy commands). Committing placeholder
// strings here is safe precisely because they're placeholders, not real
// secrets — same reasoning this project already applies to every other
// disclosed-placeholder constant (device-silence intervals, anomaly sigma
// thresholds, etc.), just applied to a parameter file instead of code.
using 'main.bicep'

param stage = 'dev'
param alertEmail = 'psrule-analysis@example.com'
param dbAdminPassword = 'PSRuleStaticAnalysisPlaceholder-NotARealSecret!'
param killswitchSecret = 'PSRuleStaticAnalysisPlaceholder-NotARealSecret!'
