# Strata documentation sources

This table is the input to the `generate-strata-docs` skill. One row per source.
See `skills/generate-strata-docs/references/manifest-schema.md` for the column contract.
Pin `ref` to a tag or SHA for reproducible runs (a branch like `main` is allowed but moves).
Add `example-app` rows as Strata-consuming app repos are identified.

| id | type | repo | ref | subpaths | notes |
|----|------|------|-----|----------|-------|
| strata-sdk | sdk | https://github.com/navapbc/strata-sdk-rails | main | docs app lib | The Strata SDK Rails engine; distill its docs/, verify against app/ + lib/ |
| app-template | rails-template | https://github.com/navapbc/template-application-rails | main |  | Rails application template |
| oscer | example-app | https://github.com/navapbc/oscer | main | reporting-app/app | Consumes the Strata SDK; demonstrates feature keys |
| strata-unemployment | example-app | https://github.com/navapbc/strata-unemployment | main | unemployment/app | Unemployment benefits starter app built on the Strata SDK; demonstrates feature keys |
| template-infra | infra-template | https://github.com/navapbc/template-infra | main | docs infra | Terraform/AWS infra template; distill docs/infra + ADRs, verify against infra/modules; integrates_with the app template |
| platform-cli | platform-cli | https://github.com/navapbc/platform-cli | main | docs nava | nava-platform CLI; distill MkDocs docs/ + Typer command help; manages the templates |
| template-infra-azure | infra-template | https://github.com/navapbc/template-infra-azure | main | docs infra | Terraform/Azure infra template (copier-based); distill docs/ + ADRs, verify against infra/modules; integrates_with the app template |
| documentai-api | application-template | https://github.com/navapbc/strata-template-documentai-api | main | template template-only-docs | Python/FastAPI Copier template for a document-processing sidecar (deploys beside an app, e.g. Rails; classifies/extracts uploaded documents like W2/payslip via AWS Bedrock Data Automation + S3 + DynamoDB); standalone, no SDK dep |
| strata-template-rules-engine-catala | application-template | https://github.com/navapbc/strata-template-rules-engine-catala | main | template template-only-docs | Catala/Python Copier application template for a rules engine (Catala→Python compilation + REST API); distill template/ + template-only-docs + README/copier.yml; component_keys strata-template-rules-engine-catala, integrates_with the infra template |
| strata-paidleave | example-app | https://github.com/navapbc/strata-paidleave | main | paidleave/app docs | Paid leave benefits app built on the Strata SDK (Rails app in paidleave/, plus casemgmt/ and rulesengine/ services); demonstrates feature keys |
| strata-sdk-case-management | sdk | https://github.com/navapbc/strata-sdk-case-management | main | docs sdk | TypeScript case-management SDK monorepo (sdk/core, sdk/types, sdk/config-schema, sdk/case-management-blueprints); discovery-mode repo, distill docs/ + package READMEs, verify against sdk/; not the Rails SDK |
