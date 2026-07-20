# Step 02 — Route through the to11 gateway

Take the exact agent from [step 01](../01-vanilla) and send its OpenAI calls **through
the to11 gateway** instead of straight to OpenAI. You add the `@to11ai/sdk`, point the
OpenAI client at the gateway with one call, and get full request/response observability —
with **no change to the prompt or the tools**.

## Goal

Get every model call traced in to11 (cost, latency, payloads) while the app behaves
identically to step 01.

## Prerequisites

- Step 01 working.
- A to11 account: an **API key** and a **project id**.
- `@to11ai/sdk` ≥ 2.0.0-rc.1.

## What changed from step 01

The gateway is **OpenAI-compatible**, so you keep using the OpenAI SDK — the to11 SDK just
supplies the base URL and headers that point it there. `openaiOptions()` returns a plain
`{ baseURL, apiKey, defaultHeaders }` (the gateway really is just a base URL + headers), and
`turn().headers()` supplies the per-call auth and trace headers:

```ts
const to11 = createClient({ env: TO11_ENV }); // reads TO11_API_KEY / TO11_PROJECT_ID from env

// Point the OpenAI client at the gateway. The provider key is still ours in step 02,
// so we pass it — the gateway forwards it upstream.
const openai = new OpenAI(to11.openaiOptions({ apiKey: OPENAI_API_KEY }));

// One turn for the whole run: a single traceparent + session id, hoisted so every
// call in the tool loop groups into ONE trace.
const headers = to11.turn().headers();

await openai.chat.completions.create(
  { model: "gpt-4o", messages, tools, tool_choice: "auto" /* … */ },
  { headers },
);
```

No manual `x-to11-*` header map and no hand-rolled `traceparent` — the SDK mints and carries
them. The prompt, tools, and tool-use loop are otherwise untouched.

## Steps

```bash
bun install
cp .env.example .env        # set OPENAI_API_KEY, TO11_API_KEY, TO11_PROJECT_ID
bun start
```

## Expected output

Same answer as step 01 (two chained tool calls, then the jacket recommendation), and the whole
run shows up as **one trace in the to11 dashboard**: the loop's model calls share a trace id,
so they group under a single trace (the `SESSION` column shows this run's id). The HTTP response
also carries an `x-to11-request-id` header you can correlate with that trace.

## One trace per run

A trace in to11 is every span that shares a `trace_id`. The turn's `headers()` carries a single
W3C `traceparent` — `00-<trace_id>-<span_id>-01`, with the **same** `trace_id` on every call —
so the gateway records all the loop's model calls under one trace. Because the turn is created
once and its headers reused, every call in the loop lines up as one trace; create a turn
*inside* the loop instead and each call would get its own. The `x-to11-session-id` (also from
the turn) groups this run in the trace list. (A labeled "agent turn" parent span _above_ the
model calls needs app-side OpenTelemetry — out of scope here.)

## Two URLs, don't mix them

- The **gateway** — the **data plane**. It's an OpenAI-compatible endpoint; `openaiOptions()`
  points the OpenAI client there. Host defaults to `https://gw.to11.ai` (override with
  `TO11_GATEWAY_URL`; the SDK adds the `/v1` path).
- (Introduced in step 04: the **control-plane** API for prompt management — a *different* host,
  `TO11_API_URL`. Don't point one at the other.)

## What this step teaches

- The gateway is a drop-in: OpenAI-compatible ingress means your existing SDK code works
  unchanged behind a different base URL — one that `openaiOptions()` hands you.
- Observability is free — you didn't touch the prompt or the tools, yet every call is now
  captured.

## Next

[Step 03](../03-connect-provider) connects your OpenAI provider inside to11 so you can
**drop `OPENAI_API_KEY` from the app entirely** — the gateway injects the upstream
credential.
