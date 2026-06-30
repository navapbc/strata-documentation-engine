---
id: strata-sdk-api-authentication
title: API authentication
source: strata-sdk
doc_type: feature
tags: [strata-sdk, api-authentication, hmac, security]
related:
  - strata-sdk-authorization
feature_keys:
  - auth
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::ApiAuthenticator service and pluggable auth strategies (HMAC out of the box) for securing API endpoints.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - lib/strata/auth.rb
    - lib/strata/auth/strategies/hmac.rb
    - app/services/strata/api_authenticator.rb
    - lib/strata/testing/api_auth_helpers.rb
    - docs/api-authentication.md
verified: ok
last_documented: 2026-06-29
---

# API authentication

`Strata::ApiAuthenticator` (`app/services/strata/api_authenticator.rb`) secures API endpoints. It
is a thin wrapper around a pluggable **strategy** object; HMAC ships out of the box.

```ruby
strategy = Strata::Auth::Strategies::Hmac.new(secret_key: ENV["API_SECRET_KEY"])
authenticator = Strata::ApiAuthenticator.new(strategy: strategy)
authenticator.authenticate!(request)   # returns true or raises Strata::Auth::AuthenticationError
```

`authenticate!(request)` delegates to `strategy.authenticate!(request)`. On success it returns `true`.
On failure the HMAC strategy itself raises a `Strata::Auth::AuthenticationError` *subtype*
(`MissingCredentials` or `InvalidSignature`) via `fail_auth!`, and that subtype propagates unchanged.
`ApiAuthenticator` only raises the base `Strata::Auth::AuthenticationError` ("No authentication provided")
in the fallback case where a strategy returns a falsy value instead of raising
(`api_authenticator.rb:19-23`, `hmac.rb:17,20,28`, `auth.rb:10-12`).

## HMAC strategy

`Strata::Auth::Strategies::Hmac` (`lib/strata/auth/strategies/hmac.rb`) verifies an HMAC-SHA256
signature of the raw request body against a shared `secret_key`. The client sends the signature in
the `Authorization` header as `HMAC sig=<base64_signature>` (header pattern
`/\AHMAC sig=(.+)\z/`). The server recomputes
`Base64.strict_encode64(OpenSSL::HMAC.digest("sha256", secret_key, body))` and compares using the
constant-time `ActiveSupport::SecurityUtils.secure_compare`. It reads and then rewinds the request
body so it can be read again downstream.

Client-side signature generation:

```ruby
signature = Base64.strict_encode64(OpenSSL::HMAC.digest("sha256", secret, body))
headers = { "Authorization" => "HMAC sig=#{signature}" }
```

## Errors

Defined in `lib/strata/auth.rb`:

- `Strata::Auth::AuthenticationError` — base class for all auth failures.
- `Strata::Auth::MissingCredentials` — missing or malformed `Authorization` header.
- `Strata::Auth::InvalidSignature` — signature mismatch.

(The SDK doc also mentions a `fail_auth!` helper and a custom-strategy example deriving from
`Strata::Auth::Strategies::Base` — see `lib/strata/auth/strategies/base.rb`.)

## Controller usage

```ruby
class Api::BaseController < ActionController::API
  before_action :authenticate_request!

  private

  def authenticate_request!
    strategy = Strata::Auth::Strategies::Hmac.new(secret_key: ENV["STRATA_API_SECRET"])
    Strata::ApiAuthenticator.new(strategy: strategy).authenticate!(request)
  rescue Strata::Auth::AuthenticationError => e
    render json: { error: e.message }, status: :unauthorized
  end
end
```

## Custom strategies

Inherit from `Strata::Auth::Strategies::Base` and implement `authenticate!(request)`, calling
`fail_auth!(ErrorClass, message)` to reject. Pass an instance to `ApiAuthenticator.new(strategy:)`.

## Testing

`Strata::Testing::ApiAuthHelpers` (`lib/strata/testing/api_auth_helpers.rb`) provides
`hmac_auth_headers(body:, secret:)` (correctly formatted `Authorization` header) and
`mock_api_request(body:, headers: {})` (a mock `ActionDispatch::Request`). Include the module in
RSpec via `config.include Strata::Testing::ApiAuthHelpers` after `require "strata/testing/api_auth_helpers"`.

## Gotchas

- The HMAC strategy signs the **raw request body** — clients and server must agree on the exact
  bytes; ensure middleware doesn't mutate the body before verification.
- The doc's error list names `InvalidSignature`; ensure your rescue catches the
  `Strata::Auth::AuthenticationError` base class to handle all failure subtypes.
