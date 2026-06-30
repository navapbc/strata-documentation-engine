# Verification findings: strata-sdk-api-authentication (round 1)

Doc: `docs/sources/strata-sdk/strata-sdk-api-authentication.md`
Source: `.sources/strata-sdk`

## Summary

The doc is substantially accurate. All major claims about `Strata::ApiAuthenticator`, the HMAC
strategy, the error hierarchy, testing helpers, and controller usage are confirmed by the source
files. One low-severity stylistic deviation was found in the controller usage example.

## Findings

### 1. Controller usage example omits `begin` block (low)

**Claim (doc lines 77-88):**
```ruby
def authenticate_request!
  strategy = Strata::Auth::Strategies::Hmac.new(secret_key: ENV["STRATA_API_SECRET"])
  Strata::ApiAuthenticator.new(strategy: strategy).authenticate!(request)
rescue Strata::Auth::AuthenticationError => e
  render json: { error: e.message }, status: :unauthorized
end
```

**Issue:** The canonical upstream example in `.sources/strata-sdk/docs/api-authentication.md`
wraps the authenticator call in an explicit `begin...rescue...end` block. The doc's inline
method-rescue form is syntactically valid Ruby but deviates from the style the upstream source
presents and has a wider rescue scope (catching any error raised in the method, not just from
the `authenticate!` call).

**Evidence:** `.sources/strata-sdk/docs/api-authentication.md:101-116` uses explicit
`begin...rescue...end`.

**Severity:** low

**Suggested fix:** Align with the upstream example by wrapping `authenticate!` in an explicit
`begin...rescue...end` block, or add a comment noting that method-level rescue is intentional.

---

## Verified claims (all confirmed)

- `Strata::ApiAuthenticator` is a thin strategy wrapper — `app/services/strata/api_authenticator.rb`.
- `authenticate!` returns `true` on success, raises `Auth::AuthenticationError("No authentication provided")` if strategy returns falsy — `api_authenticator.rb:19-23`.
- HMAC strategy raises `MissingCredentials` (blank or malformed header) and `InvalidSignature` (bad signature) via `fail_auth!` — `lib/strata/auth/strategies/hmac.rb:17,20,28`.
- Header pattern `/\AHMAC sig=(.+)\z/` — `hmac.rb:9`.
- Signature computed as `Base64.strict_encode64(OpenSSL::HMAC.digest("sha256", secret_key, body))` — `hmac.rb:36-40`.
- `ActiveSupport::SecurityUtils.secure_compare` used for constant-time comparison — `hmac.rb:27`.
- Body rewound after read — `hmac.rb:25`.
- Error hierarchy (`AuthenticationError` base, `MissingCredentials`, `InvalidSignature`) — `lib/strata/auth.rb:10-12`.
- Custom strategies inherit from `Strata::Auth::Strategies::Base` and implement `authenticate!` — `lib/strata/auth/strategies/base.rb:17-19`.
- `fail_auth!(ErrorClass, message)` is a private method in `Base` — `base.rb:24-26`.
- `Strata::Testing::ApiAuthHelpers` provides `hmac_auth_headers(body:, secret:)` and `mock_api_request(body:, headers: {})` — `lib/strata/testing/api_auth_helpers.rb`.
- Include via `config.include Strata::Testing::ApiAuthHelpers` after `require "strata/testing/api_auth_helpers"` — confirmed by `.sources/strata-sdk/docs/api-authentication.md:136-140`.
