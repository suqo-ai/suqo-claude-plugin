import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WebhookEvent } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

const WEBHOOK_PATH = "/webhooks/suqo";

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Read the raw bytes FIRST — no framework here to accidentally parse them for us.
  const rawBody = await readRawBody(req);

  const signature = req.headers["x-suqo-signature"];
  const timestamp = req.headers["x-suqo-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    res.writeHead(400).end();
    return;
  }

  const verified = getSuqoClient().webhooks.verify({
    rawBody,
    signature,
    timestamp,
    secret: process.env.SUQO_WEBHOOK_SECRET!,
  });

  if (!verified) {
    res.writeHead(400).end();
    return;
  }

  // Return 2xx fast, then process out of band — a slow handler gets retried and duplicated.
  res.writeHead(200).end();

  // Parse only AFTER verifying. Event payloads stay snake_case on purpose.
  const event = JSON.parse(rawBody.toString("utf8")) as WebhookEvent;
  void processEvent(event);
}

async function processEvent(event: WebhookEvent): Promise<void> {
  // Be idempotent — key on subscription_id (or the api_key_id for api_key.* events);
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

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    handleWebhook(req, res).catch((err: unknown) => {
      console.error(err);
      res.writeHead(500).end();
    });
    return;
  }
  res.writeHead(404).end();
});

server.listen(3000);
