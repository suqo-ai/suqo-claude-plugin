import type { MessageResponse } from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

/** Schedules cancellation at the end of the current billing period — not immediate. */
export async function cancelSubscription(subscriptionId: string): Promise<MessageResponse> {
  return getSuqoClient().subscriptions.cancel(subscriptionId);
}

/**
 * Collection-level call — subscriptionId travels in the request body, not the
 * URL path, unlike cancel()/resume(). nextBillingCycle must be today-or-future,
 * formatted "YYYY-MM-DD".
 */
export async function updateSubscriptionBillingCycle(
  subscriptionId: string,
  nextBillingCycle: string,
): Promise<MessageResponse> {
  return getSuqoClient().subscriptions.updateBillingCycle({ subscriptionId, nextBillingCycle });
}

/**
 * Un-schedules a pending cancellation / reactivates. Confirmed public and
 * working, but its response shape is "likely-correct-but-unverified" per the
 * SDK's own source comment (built from a Swagger example only) — don't build
 * brittle logic on an exact field of the response here.
 */
export async function resumeSubscription(subscriptionId: string): Promise<MessageResponse> {
  return getSuqoClient().subscriptions.resume(subscriptionId);
}

/**
 * The shared write error ladder from templates/subscription-error-handling.ts
 * — the same one templates/create-subscription.ts uses, so cancel/
 * updateBillingCycle/resume get identical error handling to create instead of
 * a second hand-maintained copy. None of the three retry automatically — a
 * NetworkError means the write may or may not have landed; reconcile with
 * subscriptions.list().
 */
export { handleSubscriptionWrite as withSubscriptionErrorHandling } from "./subscription-error-handling.js";
