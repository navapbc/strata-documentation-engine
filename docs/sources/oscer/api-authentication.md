---
id: example-oscer-api-authentication
title: OSCER — HMAC API authentication
source: oscer
verified: ok
doc_type: example
tags: [example-app, oscer, auth, hmac, api]
related:
  - example-oscer-overview
  - example-oscer-authorization
demonstrates: [auth]
summary: How OSCER authenticates inbound API requests with the SDK's HMAC strategy via Strata::ApiAuthenticator and Strata::Auth::Strategies::Hmac.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750"
  paths:
    - reporting-app/app/controllers/concerns/api_hmac_authentication.rb
    - reporting-app/app/controllers/api_controller.rb
    - reporting-app/app/controllers/api/direct_uploads_controller.rb
    - reporting-app/app/models/api/client.rb
last_documented: 2026-07-21
---

# OSCER — HMAC API authentication

OSCER's inbound API (used by the state system to push certifications, batch uploads, and direct
uploads) authenticates requests with the SDK's HMAC auth surface rather than the member/staff
session auth used by the web UI.

## The shared concern

`ApiHmacAuthentication` (`app/controllers/concerns/api_hmac_authentication.rb`) wraps the SDK's
authenticator and strategy. It builds an HMAC strategy from a configured secret, runs the
authenticator against the request, and maps the SDK's auth exceptions to a `401`:

```ruby
module ApiHmacAuthentication
  extend ActiveSupport::Concern

  private

  def authenticate_api_request!
    strategy = Strata::Auth::Strategies::Hmac.new(secret_key: Rails.configuration.api_secret_key)
    authenticator = Strata::ApiAuthenticator.new(strategy: strategy)

    begin
      authenticator.authenticate!(request)
      @current_api_client = Api::Client.new
    rescue Strata::Auth::AuthenticationError, Strata::Auth::InvalidSignature, Strata::Auth::MissingCredentials => e
      render json: { errors: [ e.message ] }, status: :unauthorized
      false
    end
  end
end
```

SDK pieces in use:

- **`Strata::Auth::Strategies::Hmac.new(secret_key:)`** — the HMAC signature strategy, keyed by the
  app's `api_secret_key`.
- **`Strata::ApiAuthenticator.new(strategy:)`** / `#authenticate!(request)` — verifies the request's
  signature against the strategy.
- **`Strata::Auth::AuthenticationError`, `Strata::Auth::InvalidSignature`,
  `Strata::Auth::MissingCredentials`** — the SDK error hierarchy the concern rescues to return a
  clean `401` JSON body.

On success the concern sets `@current_api_client = Api::Client.new`, an authenticated client
principal (`Api::Client#state_system?` returns `true`; its `staff?`/`member?`/`admin?` all return
`false`) that Pundit uses as `pundit_user` for API authorization.

## Why a shared concern

The concern is `include`d by two controllers with different base classes that can't share an
inheritance chain:

- `ApiController < ActionController::Metal` (`app/controllers/api_controller.rb`) — the main JSON API;
  it `include`s `Pundit::Authorization`, sets `pundit_user` to `@current_api_client`, and runs
  `before_action :authenticate_api_request!`.
- `Api::DirectUploadsController < ActiveStorage::DirectUploadsController`
  (`app/controllers/api/direct_uploads_controller.rb`) — presigned-upload endpoint; it
  `skip_before_action :authenticate_user!` (so a Devise `authenticate_user!` monkey-patched onto the
  parent doesn't pre-empt HMAC) and runs the same HMAC `before_action` instead.

This keeps a single HMAC entry point across both controller families while reusing the SDK's auth
strategy and error types. (The member/staff Cognito/OIDC and Devise authentication under
`app/adapters/auth/` and `app/forms/users/` is app-specific and not part of the SDK auth surface.)
