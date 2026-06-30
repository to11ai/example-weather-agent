# Step 04 — Author the prompt in to11 and fetch it

The prompt leaves the app. You author it **once** in to11 (persona, rules, the VIP
conditional, a few-shot, and the tool definitions), release it to the `prod` label, and the
app **fetches** the released version at runtime. `index.ts` now contains zero prompt text.

This is the first step that uses **`@to11ai/sdk`** (for the control-plane prompt API).

## Goal

Move all prompt content into to11; have the app fetch the released version, convert it to
OpenAI shape, and run it — with the authored `developer` rules and tool definitions
actually reaching the model.

## Prerequisites

- Step 03 working (provider connected in to11; `TO11_PROVIDER` set).
- `@to11ai/sdk` ≥ 0.7.0 (the version with `fetch().tools`, `toOpenAITools`, and
  `developerRole`).

## Author the prompt (one time)

```bash
bun install
cp .env.example .env        # TO11_API_KEY, TO11_PROJECT_ID, TO11_PROVIDER, TO11_API_URL
bun run author              # creates the prompt + version, releases it to `prod`
```

`author.ts` is the **only** place prompt text lives. It stores a chat template that
exercises all **five to11 block roles** plus a conditional block:

| Role | Block |
|------|-------|
| `system` | persona; the VIP block (rendered only when `tier == "vip"`) |
| `developer` | the operating rules (outrank the user) |
| `user` | the few-shot question + the templated user turn |
| `assistant` | the few-shot reply |
| `tool` | `geocode_city` and `get_current_weather` **definitions** |

## Run

```bash
bun start
```

The app:

```ts
const fetched = await to11.prompts.fetch("weather-concierge", {
  developerRole: "developer",          // keep the developer block as a developer message
  variables: { assistant_name: "Nigel", city: "New York", units: "fahrenheit", tier: "vip",
               user_message: "Do I need a jacket?" },
});
const messages = toOpenAIMessages(fetched.messages);  // OpenAI-ready (incl. developer role)
const tools = toOpenAITools(fetched.tools);           // from the authored tool blocks
```

- **`developerRole: "developer"`** keeps the authored `developer` rules as a `developer`
  message instead of folding it to `user`. (Use `"system"` for providers/models that don't
  accept the `developer` role.)
- **`fetched.tools`** are the authored tool-definition blocks, lifted out for you;
  `toOpenAITools` turns them into OpenAI function tools. The tools are *used*, not just
  stored.
- Model params (`model`, `temperature`, `max_tokens`) come from the version's `modelConfig`
  via `getVersion`. The model is prefixed with your provider slug for routing:
  `` `${TO11_PROVIDER}::${cfg.model}` `` (step 03's mechanism).

## Two URLs

- `TO11_API_URL` — **control plane** (REST API); `createClient`'s `baseUrl`, used to fetch
  the prompt. Hosted `https://api.to11ai.com`, local `http://localhost:4500`.
- `TO11_GATEWAY_URL` — **data plane** (gateway); the OpenAI client `baseURL`, used for the
  model call. Hosted `https://gw.to11.ai/v1`, local `http://localhost:4000/v1`. Different
  services — don't mix them.

## What changed

- The hardcoded `messages`/`tools` are gone from `index.ts`; it fetches them.
- `author.ts` added; `@to11ai/sdk` added as a dependency.

## Note on the worked few-shot

Step 01's prompt included a *positive* few-shot — a full `assistant → tool_call → tool
result → answer` exchange. to11's authored-template surface (as of SDK 0.7.0) models tool
**definitions** but not an authored multi-turn tool-call example, so the version here uses
the text-only forecast-boundary few-shot. The positive pattern still lives in step 01's
code; authoring it inside a managed prompt is future platform work.

## Next

[Step 05](../05-label-deploy) versions the prompt: deploy a v2 to `staging`, test it,
promote to `prod`, attach per-version provenance, and roll back — all without redeploying
the app.
