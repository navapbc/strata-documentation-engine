# Verification findings: example-strata-unemployment-overview (round 2)

Doc: `docs/sources/strata-unemployment/overview.md`
Source: `.sources/strata-unemployment` @ 480303cf99722ff87c97e325e34316300b1bbd26

## Status

✓ **NO FINDINGS** — All claims verified against source code. Round 1 issue (incorrect filename reference) has been fixed.

## Verified claims (all accurate)

- Gemfile git-gem line and its comment (`unemployment/Gemfile:32-35`) — exact match: `gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git", branch: "main"` with correct comment.
- Controller `include Strata::Flows::ApplicationFormController`, `flow UnemploymentBenefitsFlow`, `submit_application` call — all confirmed in `unemployment_benefits_application_forms_controller.rb`.
- Staff controller `< Strata::StaffController`, `case_classes` returns `[]` — confirmed in `staff_controller.rb:3,6-8`.
- Routes dynamically generated via `UnemploymentBenefitsFlow.pages.each`, Strata engine mounted at `/` — confirmed in `config/routes.rb:6,12-15`.
- Model `< Strata::ApplicationForm` with `strata_attribute` declarations; flow includes `Strata::Flows::ApplicationFormFlow` — confirmed in model and flow files.
- Form-builder field helpers in `edit_*.html.erb` files (e.g., `f.name`, `f.memorable_date`, `f.tax_id_field`, `f.email_field`, `f.address_fields`) — confirmed across multiple edit templates.
- Pre-built ViewComponents/Strata templates in `show.html.erb` and `index.html.erb` — confirmed; both render Strata engine templates.
- Template provenance via `.template-application-rails/unemployment.yml` recording `_src_path: https://github.com/navapbc/template-application-rails` — **FIXED and verified**: file exists at correct path with correct content.
- Auth adapters (Cognito/mock pair) under `app/adapters/auth/` and `AuthService` in `app/services/auth_service.rb` — confirmed; both adapters implemented and used by service.
- SDK features NOT used within `unemployment/app`: determination, case, business-process, audit-log, rules-engine, virtual-actor — confirmed via code inspection; no evidence of usage.

## Document quality

The document is clear, well-organized, and all code references are accurate and verifiable against the source commit.
