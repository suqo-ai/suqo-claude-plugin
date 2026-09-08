import {
  KycRequiredError,
  AuthenticationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  SuqoConfigError,
  ValidationError,
  type CreateSubscriptionResponse,
  type CustomerInput,
} from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

/**
 * Creates a subscription for a buyer and returns the checkout URL to redirect
 * them to. `checkoutUrl` is NOT proof of payment — the real outcome (paid or
 * failed) arrives later via the checkout.succeeded/checkout.failed webhooks;
 * see templates/webhook-express.ts.
 *
 * If this same buyer already has an inactive/expired subscription for this
 * product+billing-period, SUQO reactivates it instead of creating a new one.
 * A currently-active one throws ValidationError for a duplicate subscription.
 *
 * `customer` takes the SDK's full CustomerInput shape directly (rather than a
 * narrower local type) so billing/shipping overrides stay reachable — see
 * subscriptions.md for the billing_-prefix wire asymmetry on those fields.
 */
export async function createSubscriptionForBuyer(params: {
  pbpId: string;
  returnUrl: string;
  customer: CustomerInput;
}): Promise<CreateSubscriptionResponse> {
  const suqo = getSuqoClient();

  return suqo.subscriptions.create({
    pbpId: params.pbpId,
    returnUrl: params.returnUrl,
    customer: params.customer,
  });
}

/**
 * The full write error ladder — the same instanceof checks apply to every
 * write in this SDK (cancel/updateBillingCycle/resume too, see
 * templates/manage-subscription.ts). None of these writes retry
 * automatically, so a NetworkError here means the create may or may not have
 * landed — reconcile with subscriptions.list(), don't just resend.
 */
export async function handleCreateSubscription(req: {
  pbpId: string;
  returnUrl: string;
  customer: CustomerInput;
}): Promise<{ status: number; body: unknown }> {
  try {
    const response = await createSubscriptionForBuyer(req);
    return { status: 201, body: response };
  } catch (err) {
    if (err instanceof ValidationError) {
      // A genuine problem with THIS request — safe to reflect back.
      // fieldErrors keys are already wire-corrected: "customer.phone", not "client.phone".
      return { status: 422, body: { message: err.message, fieldErrors: err.fieldErrors } };
    }
    if (err instanceof NotFoundError) {
      return { status: 404, body: { message: err.message } };
    }
    if (err instanceof KycRequiredError || err instanceof AuthenticationError) {
      // NOT the buyer's fault — this means the merchant's own SUQO account
      // (KYC status, or the API key itself) needs attention. Never leak
      // kycStatus or auth details to the buyer; alert internally instead.
      console.error("SUQO merchant configuration problem:", err);
      return { status: 500, body: { message: "Something went wrong. Please try again later." } };
    }
    if (err instanceof RateLimitError) {
      // Reserved — the live API doesn't emit 429 today, but handle it anyway.
      return { status: 429, body: { message: err.message, retryAfter: err.retryAfter } };
    }
    if (err instanceof ServerError) {
      return { status: 502, body: { message: "SUQO is temporarily unavailable." } };
    }
    if (err instanceof NetworkError) {
      return { status: 504, body: { message: "Could not reach SUQO." } };
    }
    if (err instanceof SuqoConfigError) {
      // A misconfigured client (bad key/baseUrl) is a deploy bug, not a buyer
      // error — let it surface rather than mapping it to a response.
      throw err;
    }
    throw err;
  }
}
