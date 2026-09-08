// Next.js App Router route handler — place this file at
// app/api/webhooks/suqo/route.ts. It will NOT be a sibling of suqo-client.ts
// at that location, so adjust the import below to wherever you keep the
// shared client (e.g. "@/lib/suqo-client" if that's aliased, or a relative
// path like "../../../../lib/suqo-client.js").
import type { WebhookEvent } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js"; // <- adjust this path, see above

// Same default Express's own express.raw() ships with.
const MAX_BODY_BYTES = 100 * 1024;

/** Reads the request body as text, aborting once it exceeds maxBytes rather than buffering it all first. */
async function readRawTextCapped(req: Request, maxBytes: number): Promise<string> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    throw new Error("Payload too large");
  }
  if (!req.body) {
    return "";
  }

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Payload too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export async function POST(req: Request): Promise<Response> {
  // Read the raw text FIRST — before anything (req.json()) would parse and discard it.
  let rawBody: string;
  try {
    rawBody = await readRawTextCapped(req, MAX_BODY_BYTES);
  } catch {
    return new Response(null, { status: 413 });
  }

  const signature = req.headers.get("x-suqo-signature");
  const timestamp = req.headers.get("x-suqo-timestamp");
  if (!signature || !timestamp) {
    return new Response(null, { status: 400 });
  }

  const verified = getSuqoClient().webhooks.verify({
    rawBody,
    signature,
    timestamp,
    secret: process.env.SUQO_WEBHOOK_SECRET!,
  });

  if (!verified) {
    return new Response(null, { status: 400 });
  }

  // Parse only AFTER verifying. Event payloads stay snake_case on purpose.
  const event = JSON.parse(rawBody) as WebhookEvent;
  void processEvent(event);

  // Return 2xx fast, then process out of band — a slow handler gets retried and duplicated.
  return new Response(null, { status: 200 });
}

async function processEvent(event: WebhookEvent): Promise<void> {
  // Be idempotent — key on subscription_id (or api_key_id for api_key.* events);
  // redelivery is normal, the SDK keeps no replay store of its own.
  switch (event.event) {
    case "checkout.succeeded":
      console.log("checkout succeeded", event.subscription_id, event.amount);
      break;
    case "checkout.failed":
      console.log("checkout failed", event.subscription_id);
      break;
    case "subscription.status_changed":
      console.log(event.subscription_id, event.previous_status, "->", event.current_status);
      break;
    default:
      console.log("unhandled event", event.event);
  }
}
