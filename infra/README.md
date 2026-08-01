# ⚠️ DEPRECATED — pre-pivot AWS CDK infrastructure

**This directory is not part of the product and is not deployed by anything.**

PeakLogic runs on **Azure**. All live infrastructure is Bicep, in [`../infra-azure/`](../infra-azure/).

## Status

- **Not referenced by CI** — `.github/workflows/ci.yml` validates `infra-azure/` only.
- **Not referenced by the backend** — `backend/` targets Azure Functions.
- **Not deployed by any workflow** — `deploy-{dev,staging,prod}.yml` run `az deployment group create` against `infra-azure/main.bicep`.
- **Never deployed to a real AWS account** at any point.

## Why it's still here

Retained as read-only historical reference for the AWS→Azure port. Several Azure modules in `infra-azure/` were derived from the corresponding CDK stack here, and a few architecture decisions are documented relative to what the AWS version did (see `docs/architecture/azure-restructuring-plan.md`). Deleting it would remove that provenance; git history preserves it either way.

The standalone `PeakLogicSystems/PeakLogic-AWS` repository remains the complete, unmodified AWS-native line if it is ever genuinely needed.

## Do not

- Do not add to, update, or "fix" anything in this directory.
- Do not treat anything here as describing current architecture — it does not.
- Do not cite it in customer-facing or product documentation.

New infrastructure work goes in `infra-azure/`.
