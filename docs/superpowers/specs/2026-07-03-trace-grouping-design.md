# Trace grouping + prompt provenance — design

**Date:** 2026-07-03
**Status:** Approved (pending spec review)
**Scope:** `steps/02-gateway`, `steps/03-connect-provider`, `steps/04-fetch-prompt`

## Problem

Each turn of the weather agent's tool-use loop is a separate `openai.chat.completions.create`
call. The loop runs three times for the demo scenario (geocode → weather → final answer), so
one logical agent run shows up in the to11 trace UI as **three separate traces**:

| Trace | Duration | Spans | Contents |
|-------|----------|-------|----------|
| `01bd…` | 2046ms | 2 | `chat gpt-4o` + child `tool_call.geocode_city` |
| `d1d5…` | 559ms | 2 | `chat gpt-4o` + child `tool_call.get_current_weather` |
| `92aa…` | 878ms | 1 | `chat gpt-4o` (final answer, no tool call) |

The `SESSION` column reads `unknown` (no session id is sent). In step 04 the trace also carries
no prompt attribution, even though the app fetches a managed prompt.

## Why it happens

A "trace" in to11 is every span sharing one `trace_id`. When a request carries no `traceparent`
header, the gateway mints a fresh random `trace_id` and roots the gen_ai span as its own trace
(`gateway-telemetry` `root_genai_context`, TO11-2509). Three calls with no `traceparent` → three
random trace ids → three traces.

The gateway already builds correct per-turn structure: each `chat` span is a root, and when the
model emits a tool call the gateway nests a real `tool_call.*` child span (real, resolvable
span ids) beneath it. The only missing piece is a shared trace across the three calls.

## Approach

Send a **single constant `traceparent`** on every gateway call in one agent run, plus a
per-run **session id**. Both are static for the run, so they live in the OpenAI client's
`defaultHeaders` (constructed once). No new dependency: the ids are generated with Bun's
Web Crypto global.

```ts
// Bun-native (Web Crypto global) — hex ids for the W3C traceparent
const hex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const traceId = hex(16); // 32 hex — the grouping key, shared by all calls this run
const spanId = hex(8); // 16 hex — the (phantom) parent the gen_ai spans point at
const sessionId = crypto.randomUUID(); // one per run
const traceparent = `00-${traceId}-${spanId}-01`; // 01 = sampled
```

`traceparent` format is `00-<trace_id>-<span_id>-<flags>`:
- `<trace_id>` is the grouping key — identical on all three calls → one trace.
- `<span_id>` becomes the parent of the span the gateway creates.
- `<flags> = 01` marks the span sampled (recorded).

### Result

The three trace rows collapse into **one trace, 5 spans**:

```
(one trace_id)
├── chat gpt-4o                       ← turn 1
│   └── tool_call.geocode_city
├── chat gpt-4o                       ← turn 2
│   └── tool_call.get_current_weather
└── chat gpt-4o                       ← turn 3 (final answer)
```

The two `tool_call` children stay attached to their `chat` spans (those parents are real and in
the store). The three `chat` spans now point at the run's `spanId`; because nothing emits a span
with that id, they orphan up to the trace root and render as three top-level subtrees under one
trace. `SESSION` shows the run's uuid instead of `unknown`.

## What changes, per step

Steps 02, 03, 04 all route the tool-use loop through the gateway, so all three get trace grouping
+ session id. Step 01 calls OpenAI directly (no gateway) and is untouched. Prompt provenance
applies only to step 04, the one step that fetches a managed prompt.

| Step | traceparent + session id | prompt provenance | new dependency |
|------|:---:|:---:|:---:|
| 01 vanilla | — (no gateway) | — | — |
| 02 gateway | yes | — (prompt is inline code) | none (Web Crypto global) |
| 03 connect-provider | yes | — (prompt still inline) | none |
| 04 fetch-prompt | yes | yes | none (`@to11ai/sdk` already present) |

### Steps 02 and 03

Add the id-generation block above `main()` (or at the top of `main()`), then two static header
lines to the existing client:

```ts
const openai = new OpenAI({
  baseURL: TO11_GATEWAY_URL,
  apiKey: /* unchanged per step */,
  defaultHeaders: {
    "x-to11-authorization": `Bearer ${TO11_API_KEY}`,
    "x-to11-project-id": TO11_PROJECT_ID,
    "x-to11-env": TO11_ENV,
    "x-to11-session-id": sessionId, // fills SESSION; groups this run
    traceparent, // collapses the loop into one trace
  },
});
```

The tool-use loop is otherwise unchanged.

### Step 04

Same two additions, plus prompt provenance. Fold the hand-written auth headers into the
`gatewayAuthHeaders` helper (already imported from `@to11ai/sdk/gateway` alongside the other
gateway helpers) for consistency with `gatewayPromptHeaders`:

```ts
import {
  gatewayAuthHeaders,
  gatewayPromptHeaders,
  // …existing converters…
} from "@to11ai/sdk/gateway";

const openai = new OpenAI({
  baseURL: TO11_GATEWAY_URL,
  apiKey: TO11_API_KEY,
  defaultHeaders: {
    ...gatewayAuthHeaders({ apiKey: TO11_API_KEY, projectId: TO11_PROJECT_ID, env: TO11_ENV }),
    ...gatewayPromptHeaders(fetched), // x-to11-prompt-id / -version / [-release-id / -variant-name / -labels]
    "x-to11-session-id": sessionId,
    traceparent,
  },
});
```

`fetched` is a `FetchedPrompt` and carries `promptId`, `version`, `releaseId`, `variantName`,
`labels`, so `gatewayPromptHeaders(fetched)` emits the full provenance set. The gateway stamps
these onto each gen_ai span as `prompt.id` / `prompt.version` / … (exported to ClickHouse
`prompt_spans` / `prompt_metrics_1h`), so each `chat` span in the trace shows which prompt
version produced it.

## READMEs

- **02** — reframe the "each call shows up as a trace" line to "your agent turn is one trace";
  add a short W3C `traceparent` explainer (one trace id per run, shared across the loop) and note
  the session id filling the `SESSION` column.
- **03** — brief inherited note (same grouping applies).
- **04** — add a paragraph on prompt provenance (`gatewayPromptHeaders`): the trace now shows the
  prompt version that produced it. Add a one-line "next" pointer: a real labeled root span for the
  agent turn is possible via app-side OpenTelemetry exported to the to11 Collector — deliberately
  out of scope here.

## Verification

- `biome check` and `tsc` typecheck across steps 02, 03, 04.
- Confirm the `crypto.getRandomValues` / `crypto.randomUUID` globals resolve under Bun (no import).
- Live confirmation (three rows → one trace; `SESSION` populated; step 04 `prompt.*` attributes)
  requires to11 keys and a real run against the gateway — a manual check, not runnable headless.

## Non-goals

- App-side OpenTelemetry, the to11 Collector, and directly-ingested customer spans.
- A real labeled `agent-turn` root span wrapping the three `chat` spans (that needs OTel + the
  Collector; the phantom parent here yields grouping without a labeled root node).
- `x-to11-conversation-id` — a single-shot script has one conversation; it adds nothing here.
