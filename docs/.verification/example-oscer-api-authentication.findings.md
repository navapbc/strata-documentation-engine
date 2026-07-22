# Verification findings: example-oscer-api-authentication (round 1)

Doc: `docs/sources/oscer/api-authentication.md`
Source checkout: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750` (matches `source_ref.ref`)

## Result

No findings. The doc is fully supported by the source.

## Claims checked

- Frontmatter `source_ref.ref` matches the checkout HEAD SHA exactly.
- The `ApiHmacAuthentication` concern code block (doc lines 35-52) is a verbatim match of
  `reporting-app/app/controllers/concerns/api_hmac_authentication.rb` lines 8-25 (strategy build,
  authenticator, `authenticator.authenticate!(request)`, `@current_api_client = Api::Client.new`,
  rescue of `AuthenticationError`/`InvalidSignature`/`MissingCredentials` rendering `:unauthorized`
  + `false`). CONFIRMED.
- SDK pieces listed (`Strata::Auth::Strategies::Hmac.new(secret_key:)`,
  `Strata::ApiAuthenticator.new(strategy:)` / `#authenticate!(request)`, and the three-class error
  hierarchy) match the concern source. CONFIRMED.
- `Api::Client#state_system?` returns `true`; `staff?`/`member?`/`admin?` return `false` — matches
  `reporting-app/app/models/api/client.rb` lines 7-21. CONFIRMED.
- `ApiController < ActionController::Metal`, `include Pundit::Authorization`, sets `pundit_user` to
  `@current_api_client`, and runs `before_action :authenticate_api_request!` — matches
  `reporting-app/app/controllers/api_controller.rb` lines 3, 13, 16, 55-57. CONFIRMED.
- `Api::DirectUploadsController < ActiveStorage::DirectUploadsController`, includes the concern,
  `skip_before_action :authenticate_user!`, and runs the HMAC `before_action` — matches
  `reporting-app/app/controllers/api/direct_uploads_controller.rb` lines 12-18. The "can't share an
  inheritance chain" phrasing and the monkey-patched Devise `authenticate_user!` rationale match the
  source file's own comments (lines 4-11). CONFIRMED.

Minor omission (not a finding): the doc does not mention
`protect_from_forgery with: :null_session` on `Api::DirectUploadsController` — an incidental detail,
not an inaccuracy.
