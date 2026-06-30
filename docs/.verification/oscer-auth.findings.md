# Verification findings: oscer-auth (round 1)

Doc: `docs/sources/oscer/auth.md`
Source: `.sources/oscer`
Round: 1

## Summary

No findings. All claims in the doc are directly supported by the source code. The code block
reproduces the concern verbatim, the class hierarchy descriptions are accurate, and every named
SDK class matches what appears in the source.

## Verified (supported by source)

| Claim in doc | Source evidence | Verdict |
|---|---|---|
| Frontmatter `source_ref.paths` point to real files | Both `reporting-app/app/controllers/concerns/api_hmac_authentication.rb` and `reporting-app/app/controllers/api/direct_uploads_controller.rb` exist | OK |
| Code block (lines 30-47) reproduces the concern | Source `api_hmac_authentication.rb` lines 8-25 — exact match | OK |
| `Strata::Auth::Strategies::Hmac.new(secret_key: Rails.configuration.api_secret_key)` | `api_hmac_authentication.rb:14` | OK |
| `Strata::ApiAuthenticator.new(strategy: strategy)` | `api_hmac_authentication.rb:15` | OK |
| `authenticator.authenticate!(request)` verifies/raises | `api_hmac_authentication.rb:18` | OK |
| Three typed error classes (`AuthenticationError`, `InvalidSignature`, `MissingCredentials`) rescued to 401 JSON | `api_hmac_authentication.rb:20` — all three listed in rescue clause, `status: :unauthorized` | OK |
| On success sets `@current_api_client = Api::Client.new` | `api_hmac_authentication.rb:19` | OK |
| Concern shared by both `ApiController` and `Api::DirectUploadsController` | `api_controller.rb:14` and `api/direct_uploads_controller.rb:13` both `include ApiHmacAuthentication` | OK |
| `ApiController` inherits `ActionController::Metal` | `api_controller.rb:3` `class ApiController < ActionController::Metal` | OK |
| `Api::DirectUploadsController` inherits `ActiveStorage::DirectUploadsController`, ultimately `ActionController::Base` | `api/direct_uploads_controller.rb:12` and comment on lines 4-5 confirm this hierarchy | OK |
| Both controllers can't share a base class, hence the concern | Source comment `api_hmac_authentication.rb:3-7` states this explicitly | OK |
