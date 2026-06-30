# Verification findings: example-oscer-api-authentication

Doc: `docs/sources/oscer/api-authentication.md`
Source checkout: `.sources/oscer` @ `a4fc94b35ed737d20ca4530efe20d579ce5f0d53` (matches `source_ref.ref`)
Round: 1

## Result

No findings. Every claim in the doc is supported by the source.

## Claims checked

- The `ApiHmacAuthentication` concern code block (lines 35-52) is a verbatim match of
  `reporting-app/app/controllers/concerns/api_hmac_authentication.rb` (strategy build,
  authenticator, `@current_api_client = Api::Client.new`, rescue of the three error types
  rendering `:unauthorized` + `false`). CONFIRMED.
- SDK pieces listed (`Strata::Auth::Strategies::Hmac.new(secret_key:)`,
  `Strata::ApiAuthenticator.new(strategy:)` / `#authenticate!(request)`, and the
  `AuthenticationError`/`InvalidSignature`/`MissingCredentials` rescue) match the concern source. CONFIRMED.
- `Api::Client#state_system?` returns `true` — matches `app/models/api/client.rb`. CONFIRMED.
- `ApiController < ActionController::Metal`, includes Pundit + the concern, sets
  `pundit_user` to `@current_api_client`, and runs `before_action :authenticate_api_request!` —
  matches `app/controllers/api_controller.rb`. CONFIRMED.
- `Api::DirectUploadsController < ActiveStorage::DirectUploadsController`, includes the concern,
  `skip_before_action :authenticate_user!`, and runs the HMAC `before_action` — matches
  `app/controllers/api/direct_uploads_controller.rb`. The doc's phrasing that the two controllers
  have base classes that "can't share an inheritance chain" is consistent with the source comments
  (ActionController::Metal vs ActiveStorage::DirectUploadsController/ActionController::Base). CONFIRMED.
- The skip-Devise rationale ("so Devise session auth doesn't pre-empt") matches the source comment
  describing the `authenticated_active_storage.rb` monkey-patch that adds `authenticate_user!`. CONFIRMED.

Minor omission (not a finding): the doc does not mention
`protect_from_forgery with: :null_session` on `Api::DirectUploadsController`; this is an
incidental detail, not an inaccuracy.
