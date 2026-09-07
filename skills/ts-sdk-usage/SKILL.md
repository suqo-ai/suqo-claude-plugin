---
name: ts-sdk-usage
description: Use this skill whenever a developer wants to build an app or feature using the SUQO TypeScript SDK — e.g. "build me a subscription app with SUQO", "add SUQO billing to my app", "scaffold a SUQO integration" in a TypeScript or Node project. Not for PHP — use php-sdk-usage for that. Teaches Claude how the SDK is structured, which reference doc to load for a given task, and how to scaffold a working app from it.
---

# SUQO TypeScript SDK — Usage Skill

This skill teaches Claude how to use the `@suqo/sdk` TypeScript SDK to build apps for developers.

## When to use this skill

Trigger whenever the user asks to build, scaffold, or extend an app using the SUQO SDK, or asks how to do something with SUQO in TypeScript/Node.

## How to use this skill

1. **Identify the task** — what is the developer trying to build (e.g. a checkout flow, a subscription dashboard, a webhook handler)?
2. **Load the relevant reference doc** from `references/` — do not load all references at once, only the ones relevant to the task, to keep context small. See the index below.
3. **Check `templates/`** for a boilerplate snippet that's close to what's needed, and adapt it rather than writing from scratch.
4. **Install the SDK** in the target project: `npm install @suqo/sdk` (adjust package name once published).
5. **Write the code** using the SDK's documented methods only — do not guess at method names or signatures; if a reference doc doesn't cover something, say so rather than inventing an API.
6. **Verify** — run `tsc --noEmit` (or the project's build) to confirm the generated code type-checks before handing it back.

## Reference index

Add one entry per reference file as they're written, e.g.:

| Reference file | Covers |
|---|---|
| `references/client-setup.md` | Initializing the SDK client, auth/config |
| `references/products-plans.md` | Creating products, plans, billing cycles |
| `references/subscriptions.md` | Managing subscriptions, customers |
| `references/webhooks.md` | Handling SUQO webhook events |

## Templates index

| Template | Use for |
|---|---|
| `templates/basic-client.ts` | Minimal SDK client setup |
| `templates/express-webhook-handler.ts` | Example webhook receiver |

## Notes

- Keep `references/` chunked by topic (one file per SDK area) so Claude loads only what's relevant instead of the whole SDK doc at once.
- Update this SKILL.md's index tables whenever a reference or template is added.
