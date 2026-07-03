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
// One trace + session id per run (Bun Web Crypto — no import, no dependency).
const hex = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
const traceparent = `00-${hex(16)}-${hex(8)}-01`; // one trace-id, shared by every call
const sessionId = crypto.randomUUID();

const openai = new OpenAI({
  baseURL: TO11_GATEWAY_URL,            // e.g. https://gw.to11.ai/v1
  apiKey: OPENAI_API_KEY,               // still sent; the gateway forwards it upstream
  defaultHeaders: {
    "x-to11-authorization": `Bearer ${TO11_API_KEY}`,
    "x-to11-project-id": TO11_PROJECT_ID,
    "x-to11-env": TO11_ENV,             // serving environment label, e.g. "prod"
    "x-to11-session-id": sessionId,     // groups this run in the trace list
    traceparent,                        // rolls the loop's calls into ONE trace
  },
});
```

Point `baseURL` at the gateway, attach the auth headers, and send one shared `traceparent` on
every call — the prompt, tools, and tool-use loop are otherwise untouched.

## Steps

```bash
bun install
cp .env.example .env        # set OPENAI_API_KEY, TO11_API_KEY, TO11_PROJECT_ID
bun start
```

## Expected output

Same answer as step 01 (two chained tool calls, then the jacket recommendation), and the whole
run shows up as **one trace in the to11 dashboard**: the loop's three model calls share a trace
id, so they group under a single trace (the `SESSION` column shows this run's id). The HTTP
response also carries an `x-to11-request-id` header you can correlate with that trace.

## One trace per run

A trace in to11 is every span that shares a `trace_id`. With no `traceparent`, the gateway mints
a fresh trace id per request, so the loop's three calls become three traces. Sending a single
W3C `traceparent` — `00-<trace_id>-<span_id>-01`, with the **same** `trace_id` on every call —
makes the gateway record all three model calls under one trace. `<span_id>` is the parent the
gateway's spans hang under; `01` marks the trace sampled. (A labeled "agent turn" parent span
_above_ the model calls needs app-side OpenTelemetry — out of scope here.)

## Two URLs, don't mix them

- `TO11_GATEWAY_URL` — the **data plane**. It's an OpenAI-compatible endpoint; it's the
  OpenAI client's `baseURL`. Default `https://gw.to11.ai/v1`.
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
