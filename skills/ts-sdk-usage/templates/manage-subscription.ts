import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
  type MessageResponse,
} from "@suqo/sdk";
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
 * Same error ladder as templates/create-subscription.ts. None of
 * cancel/updateBillingCycle/resume retry automatically — a NetworkError means
 * the write may or may not have landed; reconcile with subscriptions.list().
 */
export async function withSubscriptionErrorHandling<T>(
  operation: () => Promise<T>,
): Promise<{ status: number; body: unknown }> {
  try {
    const body = await operation();
    return { status: 200, body };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { status: 422, body: { message: err.message, fieldErrors: err.fieldErrors } };
    }
    if (err instanceof AuthenticationError) {
      return { status: 401, body: { message: "SUQO rejected this API key." } };
    }
    if (err instanceof NotFoundError) {
      return { status: 404, body: { message: err.message } };
    }
    if (err instanceof RateLimitError) {
      return { status: 429, body: { message: err.message, retryAfter: err.retryAfter } };
    }
    if (err instanceof ServerError) {
      return { status: 502, body: { message: "SUQO is temporarily unavailable." } };
    }
    if (err instanceof NetworkError) {
      return { status: 504, body: { message: "Could not reach SUQO." } };
    }
    throw err;
  }
}
