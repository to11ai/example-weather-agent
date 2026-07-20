# Step 03 — Connect the provider in to11

Take [step 02](../02-gateway) and **remove the provider key from the app**. Instead of the
app sending `OPENAI_API_KEY` for the gateway to forward, you connect OpenAI as a provider
**inside to11** once; the gateway then injects the upstream credential on every call.

## Goal

Run the agent with **no `OPENAI_API_KEY` in the app or its `.env`** — the provider secret
lives only in to11.

## Prerequisites

- Step 02 working.
- Your to11 API key + project id.

## Connect the provider (one time, in the to11 dashboard)

1. Open to11 → **Providers**.
2. **Connect OpenAI** and paste your OpenAI API key.
3. Save. The key is now stored server-side, scoped to your workspace/project — the gateway
   uses it to authenticate upstream calls for you.

## What changed in code

`OPENAI_API_KEY` is gone — from the app and from `.env`. With no `providerApiKey`,
`openaiOptions()` carries the to11 key as a placeholder and the gateway runs the call on the
**connected provider's** stored credential:

```ts
const to11 = createClient(); // reads TO11_API_KEY / TO11_PROJECT_ID / TO11_ENV from env
const openai = new OpenAI(to11.openaiOptions()); // managed: gateway supplies the provider key
```

## Route to your connected provider (required)

Because the app no longer sends a provider key, it has to tell the gateway **which**
connected provider's stored credential to use. You do that with the connection's **slug**
(the label you gave it when connecting, e.g. `openai-01sj`) via the gateway's
`"<slug>::<model>"` model-prefix convention — the app sends `model: "openai-01sj::gpt-4o"`.
The slug comes from a **required** env var:

```ts
const { TO11_PROVIDER } = process.env;
const MODEL = `${TO11_PROVIDER}::gpt-4o`;
await openai.chat.completions.create(
  { model: MODEL, /* ... */ },
  { headers: to11.turn().headers() },
);
```

Set `TO11_PROVIDER` in `.env` to your connection's slug. (The gateway also accepts a
catalog-level `x-genai-provider: openai` header, but that selects a provider *type*, not a
*specific* connection — the model prefix does.)

## Steps

```bash
bun install
cp .env.example .env        # set TO11_API_KEY, TO11_PROJECT_ID, and TO11_PROVIDER (no OpenAI key)
bun start
```

## Expected output

Two chained tool calls, then the answer:

```
  [tool] geocode_city({"name":"New York"}) -> { latitude: 40.71, longitude: -74.01, name: "New York, ..." }
  [tool] get_current_weather({"latitude":40.71,"longitude":-74.01,"temperature_unit":"fahrenheit"}) -> { temperature_2m: 54, ... }
ASSISTANT: It's about 54°F in New York — a light jacket is plenty. Pack a compact umbrella just in case.
```

(Exact numbers vary with live weather. The VIP tier adds the packing suggestion.)

What's different here: there is **no `OPENAI_API_KEY` anywhere in this project** — the gateway
supplied the upstream credential from the connected provider. The run is still grouped into a
single trace via the hoisted turn (`traceparent` + `x-to11-session-id`), just like the previous
step ([how trace grouping works](../02-gateway#one-trace-per-run)).

## What this step teaches

- **Credential centralization.** Rotate or revoke the provider key in one place (to11)
  instead of in every app and deploy. Your application code never holds the provider secret.

## Next

[Step 04](../04-fetch-prompt) moves the **prompt itself** into to11 — the app stops
hardcoding prompt text and renders the released version at runtime.
