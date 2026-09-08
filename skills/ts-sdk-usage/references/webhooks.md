# Webhooks

```ts
suqo.webhooks.verify(options: VerifyWebhookOptions): boolean

interface VerifyWebhookOptions {
  rawBody: string | Buffer;
  signature: string;      // "X-SUQO-Signature" header, e.g. "sha256=<hex>"
  timestamp: string;      // "X-SUQO-Timestamp" header, Unix seconds as a string
  secret: string;
  toleranceSec?: number;  // default 300 (5 minutes)
}
```

`verify()` itself makes no network call, and the API key plays no role in the
verification logic. **But it's still a method on an already-constructed
`SuqoClient`** — `WebhooksResource` isn't exported for standalone
construction (see `api-surface.md`), so reaching `suqo.webhooks.verify(...)`
means building a `SuqoClient` first, which still requires a validly-shaped
`apiKey` (throws `SuqoConfigError` otherwise) even though that key is never
used by verification itself. Don't expect a key-free verification call
without a `SuqoClient` in hand somewhere.

**Never throws** — every failure mode (malformed signature, missing header,
expired timestamp, an actual mismatch) returns `false`. Never treat a thrown
error as the verification signal; there isn't one.

## The raw-body rule — the single most-broken-handler cause

Verification needs the **exact bytes** the request arrived with, not a
round-tripped re-serialization of the parsed body. A body that's been through
`JSON.parse` then `JSON.stringify` changes whitespace, key order, and number
formatting — enough to break the signature even when every field value
matches.

```ts
// Wrong — passes for a trivial fixture, fails on a real event with nested objects.
suqo.webhooks.verify({ rawBody: JSON.stringify(req.body), /* ... */ });
```

**Express**: if `express.json()` (or any JSON body-parser) already ran on
this route, the raw bytes are gone — the signature will never match. Mount
`express.raw({ type: "application/json" })` on this specific route only, not
globally, so every other route keeps its normal JSON parsing:

```ts
app.post(
  "/webhooks/suqo",
  express.raw({ type: "application/json" }),
  (req, res) => { /* req.body is a Buffer here */ },
);
```

**Next.js (App Router)**: read the raw text yourself in the route handler
before parsing anything —

```ts
export async function POST(req: Request) {
  const rawBody = await req.text();
  // ...
}
```

## Signed payload format

```
HMAC-SHA256(key = secret, message = "<timestamp>." + <raw body bytes>)
```

Hex-encoded, sent as `X-SUQO-Signature: sha256=<hex>` alongside
`X-SUQO-Timestamp: <unix seconds>`. `toleranceSec` (default 300) rejects a
delivery whose timestamp is older than that, regardless of whether the
signature itself is valid — replay protection, not just tamper detection.

## Event payloads stay snake_case — on purpose

Unlike every other model in this SDK, event payload types are **not**
camelCased, because `verify()` never parses the body at all — you call
`JSON.parse(rawBody)` yourself after verifying, and that produces the real
wire keys:

```ts
type WebhookEventType =
  | "checkout.succeeded" | "checkout.failed"
  | "subscription.status_changed"
  | "api_key.created" | "api_key.deleted" | "api_key.expired" | "api_key.expiring_soon";
```

```ts
interface CheckoutSucceededEvent { event: "checkout.succeeded"; subscription_id: string; amount: string; status: "succeeded"; }
interface CheckoutFailedEvent    { event: "checkout.failed";    subscription_id: string; amount: string; status: "failed"; }
interface SubscriptionStatusChangedEvent {
  event: "subscription.status_changed"; subscription_id: string;
  previous_status: SubscriptionStatus; current_status: SubscriptionStatus; changed_at: string;
}
interface ApiKeyCreatedEvent { event: "api_key.created"; api_key_id: string; name: string; masked_key: string; expires_at: string; created_at: string; }
interface ApiKeyDeletedEvent extends ApiKeyCreatedEvent-base { event: "api_key.deleted"; deleted_at: string; }
interface ApiKeyExpiredEvent { event: "api_key.expired"; /* ...same base fields */ }
interface ApiKeyExpiringSoonEvent { event: "api_key.expiring_soon"; /* ...same base fields */ }
```

`amount` stays a string, same decimal rule as everywhere else. `event` is
the discriminant — narrow on it, not on which fields happen to be present.

**Dashboard "send test event" payloads nest fields under a `data` key** —
different from the real shapes above. Use test deliveries to confirm your
route is wired up (verification passes, your handler gets called) — not to
validate payload parsing, since the shape genuinely differs from production
events.

## Handler checklist

1. Read the raw body **first** — before any parsing or other middleware
   touches it.
2. Verify. On `false`, return `400` and stop — don't parse, don't log the
   body as trusted, don't process.
3. Parse (`JSON.parse(rawBody)`) only after verifying.
4. Return `2xx` fast, then process out of band. A slow handler gets retried
   and duplicated.
5. Be idempotent — key on the event's own id (for the `api_key.*` events) or
   the `subscription_id` (for `checkout.*`/`subscription.status_changed`) and
   treat a repeat delivery as a no-op. Redelivery is normal; the SDK keeps no
   replay store of its own.
6. Never echo the body back, and never treat a field inside it as an
   authorization decision on its own — verification confirms it came from
   SUQO, not that its contents are safe to act on blindly.

See `templates/webhook-express.ts` and `templates/webhook-nextjs-route.ts`
for full runnable handlers, and `templates/webhook-plain-node.ts` for the
no-framework version.
