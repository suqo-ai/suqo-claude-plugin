// app/api/webhooks/suqo/route.ts — Next.js App Router route handler.
import type { WebhookEvent } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

export async function POST(req: Request): Promise<Response> {
  // Read the raw text BEFORE anything (req.json()) would parse and discard it.
  const rawBody = await req.text();

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
