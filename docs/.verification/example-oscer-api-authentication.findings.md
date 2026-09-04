# Verification findings: example-oscer-api-authentication (round 1)

Doc: `docs/sources/oscer/api-authentication.md`
Source checkout: `.sources/oscer` @ `be3ffbb4e7b7e7cf0b4047af5544870f50619257` (matches `source_ref.ref`)

## Result

No findings. Every claim in the doc is supported by the source at the pinned SHA.

## Claims checked

- Frontmatter `source_ref.ref` equals the checkout HEAD SHA (`git rev-parse HEAD`). CONFIRMED.
- The `ApiHmacAuthentication` code block is a verbatim match of
  `reporting-app/app/controllers/concerns/api_hmac_authentication.rb` lines 8-25: strategy built from
  `Rails.configuration.api_secret_key`, `Strata::ApiAuthenticator.new(strategy:)`,
  `authenticator.authenticate!(request)`, `@current_api_client = Api::Client.new`, rescue of
  `Strata::Auth::AuthenticationError` / `InvalidSignature` / `MissingCredentials` rendering
  `status: :unauthorized` then `false`. CONFIRMED.
- The three SDK pieces listed under "SDK pieces in use" match the identifiers actually referenced in
  the concern. CONFIRMED.
- `Rails.configuration.api_secret_key` is a real config key
  (`config/environments/{production,development}.rb` line 8, `test.rb` line 13). CONFIRMED.
- `Api::Client#state_system?` returns `true`; `staff?`/`member?`/`admin?` return `false` —
  `reporting-app/app/models/api/client.rb` lines 7-21. CONFIRMED.
- `ApiController < ActionController::Metal`, `include Pundit::Authorization` (line 13),
  `include ApiHmacAuthentication` (line 14), `before_action :authenticate_api_request!` (line 16),
  and `pundit_user` returning `@current_api_client` (lines 55-57). CONFIRMED.
- `Api::DirectUploadsController < ActiveStorage::DirectUploadsController`, includes the concern,
  `skip_before_action :authenticate_user!`, then `before_action :authenticate_api_request!` —
  `reporting-app/app/controllers/api/direct_uploads_controller.rb` lines 12-18. The doc's rationale
  (different base classes, Devise `authenticate_user!` monkey-patched onto the parent by
  `config/initializers/authenticated_active_storage.rb` would otherwise pre-empt HMAC) matches the
  file's own header comment, lines 3-11. CONFIRMED.
- "Two controllers include the concern" is exact: `grep -rn ApiHmacAuthentication app/` shows only
  `api_controller.rb` and `api/direct_uploads_controller.rb` as includers. CONFIRMED.
- `Api::CertificationsController < ApiController` (so it inherits the HMAC `before_action`),
  `authorize certification` (line 52), and
  `Certification.find_duplicate(member_id:, case_number:, application_date:)` (lines 56-60, defined
  at `app/models/certification.rb:70`) returning the existing record via `render_data` instead of
  creating a second row (lines 61-63). CONFIRMED.
- `prefer: respond-async` yields `202` with a `location` pointing at the outcome endpoint —
  `request.headers["prefer"] == "respond-async"` → `status: :accepted, location:
  outcome_api_certification_url(@certification)` (lines 69-70). CONFIRMED.
- The intro's scope ("certifications, batch uploads, and direct uploads") matches
  `config/routes.rb` lines 53-61 (`api/certifications`, `api/certification_batch_uploads`,
  `POST /api/direct_uploads`); the batch-upload controller also inherits `ApiController`. CONFIRMED.
- The closing parenthetical's app-specific auth paths exist: `app/adapters/auth/`
  (cognito/mock adapters, errors) and `app/forms/users/`. CONFIRMED.

## Notes (not findings)

- The doc omits `protect_from_forgery with: :null_session` on `Api::DirectUploadsController`
  (line 16) — an incidental detail, not an inaccuracy.
- The source comment describes `ActiveStorage::DirectUploadsController` as inheriting
  `ActionController::Base`; the doc says only "different base classes that can't share an
  inheritance chain", which is consistent and not overstated.
