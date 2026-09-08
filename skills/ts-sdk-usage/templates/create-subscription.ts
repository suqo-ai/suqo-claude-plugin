import {
  AuthenticationError,
  KycRequiredError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  SuqoConfigError,
  ValidationError,
  type CreateSubscriptionResponse,
} from "@suqo/sdk";
import { getSuqoClient } from "./suqo-client.js";

interface Buyer {
  phone: string;
  fullName: string;
  email: string;
  address: string;
}

/**
 * Creates a subscription for a buyer and returns the checkout URL to redirect
 * them to. `checkoutUrl` is NOT proof of payment — the real outcome (paid or
 * failed) arrives later via the checkout.succeeded/checkout.failed webhooks;
 * see templates/webhook-express.ts.
 *
 * If this same buyer already has an inactive/expired subscription for this
 * product+billing-period, SUQO reactivates it instead of creating a new one.
 * A currently-active one throws ValidationError for a duplicate subscription.
 */
export async function createSubscriptionForBuyer(params: {
  pbpId: string;
  returnUrl: string;
  buyer: Buyer;
}): Promise<CreateSubscriptionResponse> {
  const suqo = getSuqoClient();

  return suqo.subscriptions.create({
    pbpId: params.pbpId,
    returnUrl: params.returnUrl,
    customer: {
      phone: params.buyer.phone,
      fullName: params.buyer.fullName,
      email: params.buyer.email,
      address: params.buyer.address,
      // billing/shipping are optional — omitting them fills billing info from
      // the buyer's existing profile server-side. Include them only when you
      // have different values to send, and remember the wire asymmetry:
      // billing.* fields get a "billing_" prefix on write, shipping.* don't.
    },
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
  buyer: Buyer;
}): Promise<{ status: number; body: unknown }> {
  try {
    const response = await createSubscriptionForBuyer(req);
    return { status: 201, body: response };
  } catch (err) {
    if (err instanceof ValidationError) {
      // fieldErrors keys are already wire-corrected: "customer.phone", not "client.phone".
      return { status: 422, body: { message: err.message, fieldErrors: err.fieldErrors } };
    }
    if (err instanceof KycRequiredError) {
      return { status: 403, body: { message: err.message, kycStatus: err.kycStatus } };
    }
    if (err instanceof AuthenticationError) {
      return { status: 401, body: { message: "SUQO rejected this API key." } };
    }
    if (err instanceof NotFoundError) {
      return { status: 404, body: { message: err.message } };
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
