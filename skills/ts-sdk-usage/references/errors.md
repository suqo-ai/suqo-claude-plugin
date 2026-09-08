# Errors

```
Error
└── SuqoError                 status?, rawBody?, requestId?   — never thrown directly itself
    ├── AuthenticationError   401
    ├── KycRequiredError      403 — adds kycStatus?: string (wire status_code)
    ├── ValidationError       400 — adds fieldErrors: FieldErrors (Record<string, string[]>)
    ├── NotFoundError         404
    ├── RateLimitError        429 — adds retryAfter?: number (ms) — reserved, never thrown today
    └── ServerError           5xx, and the default for any unmapped status

SuqoConfigError                bad key/baseUrl at construction — NOT a SuqoError, thrown synchronously
NetworkError                   no HTTP status at all — network failure, timeout, or cancellation
```

`NetworkError` also extends `SuqoError` but carries no `status` — it's thrown
directly by the HTTP layer itself (a `fetch` rejection or an
`AbortSignal.timeout` firing), never via `mapHttpError`, since there was
never a response to map. It covers both a genuine network failure and a
timeout — there's no separate timeout class.

Check `instanceof`, never the error's `message` string or the raw response
shape — those carry no stability guarantee.

## `SuqoConfigError` is not a `SuqoError`

Thrown synchronously from `new SuqoClient(...)`, before any request — bad API
key format, or a `baseUrl` that disagrees with the key's inferred
environment (see `client-setup.md`). A single handler that covers both
startup misconfiguration and runtime API errors has to catch both types.

## `ValidationError` normalizes two wire shapes into one

```ts
interface FieldErrors { [field: string]: string[]; }

class ValidationError extends SuqoError {
  readonly fieldErrors: FieldErrors;   // always a plain object, never undefined
}
```

The wire sends one of two 400 shapes:

- **Field-keyed**: `{ "phone": ["This field is required."] }` → populates
  `fieldErrors`. Nested objects are flattened to dot-path keys
  (`customer.phone`) — and that root key is already renamed from the wire's
  `client` to `customer`, same rename as everywhere else in this SDK.
- **`detail`-shaped**: `{ "detail": "..." }` → populates only `message`;
  `fieldErrors` stays `{}`.

## `KycRequiredError`

403 with a KYC-shaped body (`{ "status_code": "<kyc status>", "message":
"..." }`). `kycStatus` is read from that `status_code`.

## `RateLimitError` — reserved, not live yet

429 with `retryAfter?: number` (milliseconds, parsed from a `Retry-After`
header in either delta-seconds or HTTP-date form, clamped to a 60s max). The
live API doesn't emit 429 today — this class exists so the type is already
in place once rate limiting ships. See the SDK's own
`docs/user/rate-limiting.md`, explicitly marked "Status: Planned."

## Retries — the headline rule

**Reads** (`list`, `autoPaging`) retry on `NetworkError`, `429`, and `5xx`,
with full-jitter exponential backoff (base 500ms, capped at 8s,
`Math.random() * min(cap, base * 2^attempt)`), up to `maxRetries` (default 2
→ 3 attempts total), honoring a `Retry-After` header when present.

**Writes** (`create`, `cancel`, `updateBillingCycle`, `resume`) **never
retry**, regardless of `maxRetries`. There's no idempotency-key support on
the backend yet (`docs/user/idempotency.md`, also "Status: Planned") — a
blindly-retried write could double-act, e.g. create a duplicate subscription.
A `NetworkError` from a write means it may or may not have landed; reconcile
by re-listing, don't just resend the same call.

A caller-supplied `AbortSignal` cancellation is never retried either, even on
an otherwise-retryable read — the SDK treats "the caller said stop" as final.

## `mapHttpError`

```ts
function mapHttpError(input: { status: number; statusText?: string; body?: unknown; requestId?: string; retryAfter?: number }): SuqoError
```

The single centralized status→class mapper every resource routes through.
Exported for anyone building a custom transport around the same rules — see
`api-surface.md`.
