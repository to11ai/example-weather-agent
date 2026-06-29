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

`OPENAI_API_KEY` is gone — from the app and from `.env`. The OpenAI SDK still needs a
non-empty `apiKey` string, so we pass the to11 key (the real auth is the
`x-to11-authorization` header):

```ts
const { TO11_API_KEY, TO11_PROJECT_ID } = process.env;
// ...
const openai = new OpenAI({
  baseURL: TO11_GATEWAY_URL,
  apiKey: TO11_API_KEY,                 // SDK needs a string; real auth is the header
  defaultHeaders: {
    "x-to11-authorization": `Bearer ${TO11_API_KEY}`,
    "x-to11-project-id": TO11_PROJECT_ID,
    "x-to11-env": TO11_ENV,
  },
});
```

## Steps

```bash
bun install
cp .env.example .env        # set TO11_API_KEY and TO11_PROJECT_ID only — no OpenAI key
bun start
```

## Expected output

Same answer as steps 01–02 — but notice there is **no `OPENAI_API_KEY` anywhere in this
project**. The gateway supplied the upstream credential from the connected provider.

## What this step teaches

- **Credential centralization.** Rotate or revoke the provider key in one place (to11)
  instead of in every app and deploy. Your application code never holds the provider secret.

## Next

[Step 04](../04-fetch-prompt) moves the **prompt itself** into to11 — the app stops
hardcoding prompt text and fetches the released version at runtime. (This is where the
`@to11ai/sdk` is introduced.)
