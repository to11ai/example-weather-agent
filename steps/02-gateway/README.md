# Step 02 — Route through the to11 gateway

Take the exact agent from [step 01](../01-vanilla) and send its OpenAI calls **through
the to11 gateway** instead of straight to OpenAI. You change three lines of setup and get
full request/response observability — with **no change to the prompt** and **no new
dependency**.

## Goal

Get every model call traced in to11 (cost, latency, payloads) while the app behaves
identically to step 01.

## Prerequisites

- Step 01 working.
- A to11 account: an **API key** and a **project id**.

## What changed from step 01

The gateway is **OpenAI-compatible**, so you keep using the OpenAI SDK — you just point its
`baseURL` at the gateway and attach to11 auth headers. No to11 SDK is needed to route a call:

```ts
const openai = new OpenAI({
  baseURL: TO11_GATEWAY_URL,            // e.g. https://gw.to11.ai/v1
  apiKey: OPENAI_API_KEY,               // still sent; the gateway forwards it upstream
  defaultHeaders: {
    "x-to11-authorization": `Bearer ${TO11_API_KEY}`,
    "x-to11-project-id": TO11_PROJECT_ID,
    "x-to11-env": TO11_ENV,             // serving environment label, e.g. "prod"
  },
});
```

That's the whole diff. The prompt, tools, and tool-use loop are untouched.

## Steps

```bash
bun install
cp .env.example .env        # set OPENAI_API_KEY, TO11_API_KEY, TO11_PROJECT_ID
bun start
```

## Expected output

Same answer as step 01 (two chained tool calls, then the jacket recommendation) — but now
the call shows up as a **trace in the to11 dashboard**, and the HTTP response carries an
`x-to11-request-id` header you can correlate with that trace.

## Two URLs, don't mix them

- `TO11_GATEWAY_URL` — the **data plane**. It's an OpenAI-compatible endpoint; it's the
  OpenAI client's `baseURL`. Hosted default `https://gw.to11.ai/v1`; local
  `http://localhost:4000/v1`.
- (Introduced in step 04: `TO11_API_URL`, the **control plane** REST API for prompt
  management — a *different* host. Don't point one at the other.)

## What this step teaches

- The gateway is a drop-in: OpenAI-compatible ingress means your existing SDK code works
  unchanged behind a different base URL.
- Observability is free — you didn't touch the prompt or add a dependency, yet every call
  is now captured.

## Next

[Step 03](../03-connect-provider) connects your OpenAI provider inside to11 so you can
**drop `OPENAI_API_KEY` from the app entirely** — the gateway injects the upstream
credential.
