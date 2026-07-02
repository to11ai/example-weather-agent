# Step 04 — Author the prompt in to11 and fetch it

The prompt leaves the app. You author it **once** in to11 (persona, rules, the VIP
conditional, a worked tool-use few-shot, and the tool definitions), release it to the `prod`
label, and the app **fetches** the released version at runtime. `index.ts` now contains zero
prompt text.

This is the first step that uses **`@to11ai/sdk`** (for the control-plane prompt API).

## Goal

Move all prompt content into to11; have the app fetch the released version, convert it to
OpenAI shape, and run it — with the authored `developer` rules and tool definitions
actually reaching the model.

## Prerequisites

- Step 03 working (provider connected in to11; `TO11_PROVIDER` set).
- `@to11ai/sdk` ≥ 1.0.0 (the version that collapsed `context` into a single
  `variables` bag; also has `fetch().tools` + `fetch().toolChoice`,
  `toOpenAITools` / `toOpenAIToolChoice`, and `developerRole`).

## Author the prompt (one time)

```bash
bun install
cp .env.example .env        # TO11_API_KEY, TO11_PROJECT_ID, TO11_PROVIDER, TO11_API_URL
bun run author              # creates the prompt + version, releases it to `prod`
```

`author` is **idempotent**: it upserts the prompt by slug and only creates a new version
when the content actually changed (it stamps a content fingerprint into the changelog and
reuses a matching version). Re-running with unchanged content is a no-op that just keeps
`prod` pointed at the right version.

`author.ts` is the **only** place prompt text lives. It stores a chat template that
exercises all **five to11 block roles** plus a conditional block:

| Role | Block |
|------|-------|
| `system` | persona; the VIP block (rendered only when the condition `tier == "vip"` holds) |
| `developer` | the operating rules (outrank the user) |
| `user` | the few-shot questions + the templated user turn |
| `assistant` | the few-shot replies, including the worked example's tool **calls** |
| `tool` | the worked few-shot's tool **results** (`{ toolCallId, content }`) |

The two tool **definitions** (`geocode_city`, `get_current_weather`) are **not** message
blocks — they live in a sibling `templateJson.tools[]` array. A `role: "tool"` block is
always a tool *result*; definitions are lifted out of the messages
and returned to the app as `fetched.tools`.

## Run

```bash
bun start
```

The app:

```ts
const fetched = await to11.prompts.fetch("weather-concierge", {
  developerRole: "developer",
  variables: { assistant_name: "Nigel", city: "New York", units: "fahrenheit",
               user_message: "Do I need a jacket?",     // {{ }} substitution
               tier: "vip" },                           // used only in conditions, not rendered
});
const messages = toOpenAIMessages(fetched.messages);    // OpenAI-ready (incl. developer role)
const tools = toOpenAITools(fetched.tools);             // from templateJson.tools[]
const toolChoice = toOpenAIToolChoice(fetched.toolChoice); // from templateJson.toolChoice
```

- **`developerRole: "developer"`** keeps the authored `developer` rules as a `developer`
  message instead of folding it to `user`. (Use `"system"` for providers/models that don't
  accept the `developer` role.)
- **`fetched.tools`** are the authored tool definitions (`templateJson.tools[]`), lifted out
  for you; `toOpenAITools` turns them into OpenAI function tools. The tools are *used*, not
  just stored.
- **`fetched.toolChoice`** is the authored, provider-neutral tool-choice directive
  (`templateJson.toolChoice`); `toOpenAIToolChoice` maps it to the OpenAI `tool_choice` field.
  Like everything else on the call, it comes from the prompt — nothing is hardcoded in the
  request. (Returns `undefined` when unset, which lets OpenAI apply its own default.)
- Model params (`model`, `temperature`, `max_tokens`) come from the version's `modelConfig`
  via `getVersion`. The model is prefixed with your provider slug for routing:
  `` `${TO11_PROVIDER}::${cfg.model}` `` (step 03's mechanism).
- **One `variables` bag:** every input goes in `variables`. Most keys are rendered — their
  values fill `{{ }}` placeholders. A key authored `renderable: false` (in the version's
  `variablesSchema`) is only used in block conditions and never substituted into the text;
  the VIP block renders when its condition `tier == "vip"` holds. (Earlier SDKs took a
  second `context` bag for this; 1.0.0 removed it — move those keys into `variables` with
  `renderable: false`.)

## Two URLs

- `TO11_API_URL` — **control plane** (REST API); `createClient`'s `baseUrl`, used to fetch
  the prompt. Default `https://api.to11.ai`.
- `TO11_GATEWAY_URL` — **data plane** (gateway); the OpenAI client `baseURL`, used for the
  model call. Default `https://gw.to11.ai/v1`. Different services — don't mix them.

## What changed

- The hardcoded `messages`/`tools` are gone from `index.ts`; it fetches them.
- `author.ts` added; `@to11ai/sdk` added as a dependency.

## The worked few-shot

The template carries the same *positive* few-shot as step 01 — a full `user → assistant
tool_call → tool result → assistant tool_call → tool result → answer` exchange — but now
**authored inside the managed prompt** rather than hardcoded in the app: an `assistant`
block can carry structured `toolCalls`, and a
`role: "tool"` block is a tool *result* (`{ toolCallId, content }`) linked back to a call by
id. `toOpenAIMessages` converts the whole exchange to OpenAI shape (`tool_calls` +
`role: "tool"` turns) for you.

## Next

[Step 05](../05-label-deploy) versions the prompt: deploy a v2 to `staging`, test it,
promote to `prod`, attach per-version provenance, and roll back — all without redeploying
the app.
