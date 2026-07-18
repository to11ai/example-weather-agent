# Step 04 — Author the prompt in to11 and render it

The prompt leaves the app. You author it **once** in to11 (a merged `system` message with the
persona, the operating rules, and a VIP conditional, plus the templated `user` turn), release
it to the `prod` label, and the app **renders** the released version at runtime. `index.ts`
now contains zero prompt text.

## Goal

Move all prompt content into to11; have the app render the released version straight into an
OpenAI request — with the authored rules actually reaching the model, and no conversion or
header plumbing in the app.

## Prerequisites

- Step 03 working (provider connected in to11; `TO11_PROVIDER` set).
- `@to11ai/sdk` ≥ 2.0.0-rc.1.

## Author the prompt (one time)

```bash
bun install
cp .env.example .env        # TO11_API_KEY, TO11_PROJECT_ID, TO11_PROVIDER
bun run author              # creates the prompt + version, releases it to `prod`
```

`author` is **idempotent**: it upserts the prompt by slug and only creates a new version
when the content actually changed (it stamps a content fingerprint into the changelog and
reuses a matching version). Re-running with unchanged content is a no-op that just keeps
`prod` pointed at the right version.

`author.ts` is the **only** place prompt text lives. It stores a chat template of **two
blocks**:

| Role | Block |
|------|-------|
| `system` | persona + operating rules, merged into one message; the VIP line is gated by a Liquid `{% if tier == "vip" %}` condition |
| `user` | the templated live question (`I'm in {{ city }}. {{ user_message }}`) |

The VIP instruction used to be a separate conditional block; here it's a Liquid `{% if %}`
inside the system message. `tier` is authored `renderable: false`, so it only drives that
condition and never appears in the rendered text.

## Run

```bash
bun start
```

The app renders the released version and spreads it straight into the request —
`format: "openai"` shapes it for the OpenAI client, so there are **no converters**:

```ts
const to11 = createClient({ env: TO11_ENV, format: "openai" });
const openai = new OpenAI(to11.openaiOptions());

const prompt = await to11.prompts.render("weather-concierge", {
  variables: { assistant_name: "Roker", city: "New York", units: "fahrenheit",
               user_message: "Do I need a jacket?",   // {{ }} substitution
               tier: "vip" },                         // used only in the condition, not rendered
});

const headers = to11.turn().headers(prompt);          // auth + trace + prompt provenance
await openai.chat.completions.create(
  { ...prompt.config, model, messages: prompt.messages },
  { headers },
);
```

- **`render()` returns an OpenAI-shaped result.** `prompt.messages` spreads directly into the
  request; the merged system message arrives with the VIP line included or dropped depending on
  `tier`. (Set `format: "anthropic"` instead and you'd get a folded `system` string.)
- **`prompt.config`** carries the model params from the version's Config pane (`model`,
  `temperature`, `max_tokens`). Spread it in; the model is prefixed with your provider slug
  for routing — `` `${TO11_PROVIDER}::${prompt.config.model}` `` (step 03's mechanism).
- **`variables`:** most fill `{{ }}` placeholders. A variable authored `renderable: false`
  (in the version's `variablesSchema`) is only used in conditions and never substituted into
  the text; the VIP line renders when `{% if tier == "vip" %}` holds.

## Prompt provenance on the trace

The app renders a *managed* prompt, so `turn().headers(prompt)` stamps the request with prompt
provenance (`x-to11-prompt-id` / `x-to11-prompt-version`, plus release / variant / labels when
present) **in addition to** the auth and trace headers from
[step 02](../02-gateway#how-the-trace-is-grouped). That tags the `gen_ai` span with the exact
prompt version behind it, so the trace shows which prompt version produced the call — one
`headers()` call carries the whole bag.

## Two URLs

- The **control plane** (`TO11_API_URL`) — where `render()` fetches the prompt. Default host
  `https://api.to11.ai`.
- The **gateway / data plane** (`TO11_GATEWAY_URL`) — where the model call runs. Default host
  `https://gw.to11.ai`. Different services — don't mix them. Both are read from the environment
  by `createClient`, so you only set them to self-host.

## What changed from step 03

- The hardcoded `system`/`user` messages are gone from `index.ts`; it renders them from to11.
- `author.ts` added.
- The gateway call carries **prompt provenance**, so the trace records the prompt version
  behind it — from the same `turn().headers(prompt)` that already carries auth and trace ids.

## Next

[Step 05](../05-label-deploy) versions the prompt: deploy a v2 to `staging`, test it,
promote to `prod`, attach per-version provenance, and roll back — all without redeploying
the app.
