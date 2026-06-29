# Weather Agent Tutorial Monorepo — Design

**Date:** 2026-06-29
**Status:** Approved
**Repo:** `to11ai/example-weather-agent` (standalone, separate from `to11ai/platform`)

## Goal

A public, step-by-step tutorial monorepo that teaches building a tool-using
weather agent and then progressively adopting the to11 platform. The app takes a
city and a question, geocodes the city, fetches current weather, and answers via
an OpenAI `gpt-4o` tool-use loop. Each step is a complete, independently runnable
snapshot; a `diff` between adjacent steps shows exactly what that step adds.

The tutorial's narrative arc:

1. Build the agent **without to11** (prompt and tools live in app code).
2. Route the LLM call **through the to11 gateway** (observability, zero prompt change).
3. **Connect the provider** in to11 (drop the provider key from the app).
4. **Fetch the prompt from to11** (author it once; the app stops hardcoding prompt text).
5. **Label-based deployment** (versions, prod/staging promotion, conditional blocks, provenance, rollback).

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Language | **TypeScript only** | The JS SDK is the complete path (`fetch()`, project-scoped `createClient`, gateway helpers). The Python SDK lacks `fetch()` and `project_id`/`env` on `create_client`, which would force divergence in the final step. |
| Provider | **OpenAI `gpt-4o`** | Matches the prototype exactly; gateway is OpenAI-compatible. |
| to11 target | **Hosted (`gw.to11.ai`) by default**, with env-var overrides to repoint local | Lightest setup for a public tutorial; overrides keep self-hosting reproducible. |
| Steps | **5 steps**, one snapshot dir each | Smoothest learning curve; each step adds exactly one layer. |
| Structure | **Self-contained dirs**, Bun, no workspace; tool code duplicated per step | Each step runs standalone (`cd steps/NN-* && bun install && bun start`); diffs isolate the to11 change. Clarity over DRY. Bun matches the platform (`bun.lock`/Turbo) and runs TypeScript directly. |
| Delivery | **Scaffold first, then one PR per step** | See Delivery Plan. |

## Repo layout

```
example-weather-agent/
  README.md                 # tutorial spine: motivation + branded architecture diagram + runtime-flow (Mermaid) + step index + global prereqs
  assets/architecture.svg   # branded, on-brand to11 architecture/flow diagram embedded in the README
  .gitignore  LICENSE  .env.example
  docs/superpowers/specs/2026-06-29-weather-agent-tutorial-design.md
  steps/
    01-vanilla/             # OpenAI direct, prompt + tools in code, no to11
    02-gateway/             # route through the to11 gateway (observability)
    03-connect-provider/    # connect OpenAI in to11; drop the provider key from the app
    04-fetch-prompt/        # author prompt in to11; app fetches rendered messages
    05-label-deploy/        # versions, prod/staging labels, VIP conditional, provenance, rollback
```

Each `steps/NN-*/` contains:

- `README.md` — Diataxis **tutorial** shape: goal → prerequisites → steps → run command → expected output → "what changed from the previous step" → "next".
- `package.json` — deps (`openai`, and `@to11ai/sdk` from step 02+; dev: `typescript`, `@types/bun`); scripts: `start`, `typecheck`.
- `tsconfig.json`.
- `.env.example`.
- `src/index.ts` — the app: env wiring, the tool-use loop, entry point.
- `src/tools.ts` — `geocode_city` + `get_current_weather` against Open-Meteo (keyless public APIs). Intentionally duplicated across steps.
- `src/author.ts` — steps 04–05 only: the one-time authoring script (create prompt + version + move label).

No root workspace; each directory installs and runs on its own.

## The agent (shared behavior across all steps)

- **Tools** (two distinct, keyless public APIs — independently verifiable; two providers makes the multi-tool story explicit):
  - `geocode_city({ name })` → `{ latitude, longitude, name }` via OpenStreetMap **Nominatim** (`nominatim.openstreetmap.org/search`; requires a descriptive `User-Agent` header per its usage policy).
  - `get_current_weather({ latitude, longitude })` → current conditions via **Open-Meteo** (`api.open-meteo.com/v1/forecast`).
  - The two calls are **chained**: the model feeds `geocode_city`'s lat/lon into `get_current_weather` — that dependency is the core tool-loop lesson.
- **Prompt content** (persona, operating rules, VIP conditional, few-shot discipline example, templated user turn) as defined in the prototype's `author.ts`. In steps 01–03 this is assembled inline in app code; from step 04 it lives only in to11.
- **All five to11 block roles are demonstrated** in the step-04 authored template: `system` (persona, VIP), `developer` (operating rules), `user` + `assistant` (few-shot, user turn), and `tool` (the two tool-definition blocks). V1 rendering normalizes `developer`→`user` and filters `tool` blocks from the returned messages — so the live call's tools come from `modelConfig.tools`, and tool *results* re-enter the loop as `role: "tool"` messages. The READMEs surface this behavior rather than hide it.
- **Tool-use loop**: stateless replay — call the model, append the assistant turn, execute any requested tools against the live API, append tool results, repeat until the model returns a final answer.

## Step-by-step deltas

### 01 — Vanilla
OpenAI SDK pointed directly at `api.openai.com`. Persona + few-shot + user turn assembled inline as a plain `messages` array; tool schemas defined inline; the tool-use loop. **Env:** `OPENAI_API_KEY`. README names the pain points this sets up: prompt buried in code, no telemetry, no versioning.

### 02 — Gateway
The *only* change from 01: point the OpenAI client `baseURL` at `${TO11_GATEWAY_URL}` (with the `/v1` suffix the OpenAI SDK expects) and attach `gatewayAuthHeaders({ apiKey, projectId, env })`, producing `x-to11-authorization: Bearer …`, `x-to11-project-id`, and `x-to11-env`. Prompt and tools unchanged. **Payoff:** full request/response telemetry with zero prompt changes; README shows the dashboard trace and the `x-to11-request-id` response header. **Env adds:** `TO11_API_KEY`, `TO11_PROJECT_ID`, `TO11_GATEWAY_URL` (default `https://gw.to11.ai/v1`), `TO11_ENV` (default `prod`). `OPENAI_API_KEY` is still set and forwarded upstream by the gateway.

### 03 — Connect provider
Dashboard action: connect OpenAI as a provider in to11 (the provider key is stored server-side). **Code delta:** remove `OPENAI_API_KEY` from the app and `.env` — the gateway injects the upstream credential. The app now holds only the to11 key. Demonstrates credential centralization. README walks the dashboard connect flow and shows the (now smaller) env file.

### 04 — Fetch prompt
New `src/author.ts`, run once (by a prompt engineer or CI, not in the request path): `prompts.create` (stable identity) + `prompts.createVersion` (`templateJson` blocks + `variablesSchema` + `modelConfig` including tool schemas) + `prompts.moveLabel` → `prod`. The app replaces its hardcoded `messages` with `to11.prompts.fetch(slug, { env, variables })`, which returns rendered messages + provenance; model params and tool schemas come from the version's `modelConfig`. Prompt text leaves the app entirely. The control-plane client is `createClient({ baseUrl: TO11_API_URL, apiKey, projectId, env })`. **Env adds:** `TO11_API_URL` (control plane). A prompt `slug` constant is introduced.

### 05 — Label-based deployment
Author a v2 of the prompt; deploy it to the `staging` label, test against `staging`, then promote to `prod`. Surface the VIP conditional block (`condition: var_eq tier=vip`) and the curated few-shot that models tool discipline. Add `gatewayPromptHeaders(fetched)` so every call is attributed to the exact released version (`x-to11-prompt-id`, `x-to11-prompt-version`, `x-to11-release-id`, `x-to11-variant-name` when present, `x-to11-prompt-labels`). Demonstrate rollback: move the `prod` label back to the previous version — **no app redeploy**.

## Conventions

- **Env loading:** Bun auto-loads `.env`. Each step ships `.env.example`; `.env` is gitignored.
- **Two distinct to11 URLs**, made explicit in every README and `.env.example` from the step that introduces each:
  - `TO11_GATEWAY_URL` — **data plane**; used as the OpenAI client `baseURL` (default `https://gw.to11.ai/v1`).
  - `TO11_API_URL` — **control plane**; used as `createClient`'s `baseUrl` for `prompts.*` (introduced in step 04).
  Conflating these is the most likely learner trip-wire; READMEs call it out.
- **README style:** Diataxis tutorial (see per-step contents above).
- **Run command:** every step runs with `bun start` (→ `bun src/index.ts`); steps 04–05 add `bun run author`, step 05 adds `bun run deploy`.

## Delivery plan

1. **Scaffold PR:** root `README.md` (tutorial spine + global prereqs + step index), `.gitignore`, `LICENSE`, root `.env.example`, the `docs/` spec, and the empty `steps/` structure. Establishes repo conventions before any step code.
2. **One PR per step**, in order 01 → 05. Each PR delivers a complete, runnable `steps/NN-*/` directory with its README, and updates the root step index. Each step builds on the previous step's code (copied forward, then modified) so the inter-step diff is the teaching artifact.

Each step PR is independently reviewable and demonstrates a single concept.

## Open items to confirm at build time (non-blocking)

- **Hosted control-plane API URL** for `createClient` `baseUrl` (the gateway is `gw.to11.ai`; the REST API host must be confirmed against the SDK/docs before step 04).
- **Where `modelConfig`/tool schemas surface on a fetch:** whether `prompts.fetch()` returns them on its `rendered` payload or a separate `prompts.getVersion()` call is needed. Verify against the JS SDK during step 04; use whichever is real (the prototype used a separate `getVersion`).
- **Verifying steps that need to11:** steps 02–05 require a reachable to11 instance and valid keys to run end to end. Authoring (`author.ts`) and gateway calls cannot be exercised in CI without credentials; READMEs state the prerequisites, and verification of those steps is manual against hosted or local to11.
```
