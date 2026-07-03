# Step 01 — Vanilla weather agent (no to11)

The starting point: a tool-using weather agent talking directly to OpenAI. The prompt and
the tool definitions both live in application code. No to11 yet.

## Goal

Run an agent that takes a city + question, calls two tools in sequence, and answers with
live weather — end to end against OpenAI.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- An OpenAI API key

## Steps

```bash
bun install
cp .env.example .env        # set OPENAI_API_KEY
bun start
```

## Expected output

The model drives two chained tool calls, then answers:

```
  [tool] geocode_city({"name":"New York"}) -> { latitude: 40.71, longitude: -74.01, name: "New York, ..." }
  [tool] get_current_weather({"latitude":40.71,"longitude":-74.01,"temperature_unit":"fahrenheit"}) -> { temperature_2m: 54, ... }
ASSISTANT: It's about 54°F in New York — a light jacket is plenty. Pack a compact umbrella just in case.
```

(Exact numbers vary with live weather. The VIP tier adds the packing suggestion.)

## How it works

- `src/tools.ts` — two real, keyless APIs: `geocode_city` → OpenStreetMap Nominatim,
  `get_current_weather` → Open-Meteo. These are identical in every later step.
- `src/index.ts` — assembles the prompt as a plain `messages` array, declares the tool
  schemas, and runs the tool-use loop: call the model, run any tools it asks for, feed the
  results back, repeat until it returns a final answer.

## What this step teaches — and its pain points

This works, but everything to11 fixes is visible here:

- **The prompt is buried in code.** The persona, the operating rules, the VIP branch, and
  the few-shot are all hardcoded in `index.ts`. Changing wording means a code change and a
  redeploy.
- **The VIP rule is a hand-written `if`.** to11 expresses this as a declarative conditional
  block instead.
- **No observability.** You can't see what was sent, what it cost, or how long it took
  without bolting on your own logging.
- **No versioning or provenance.** There's no way to know which prompt produced which answer,
  roll back a bad change, or A/B a variant.

## Next

[Step 02](../02-gateway) routes this exact call through the to11 gateway — full
request/response telemetry with **zero changes to the prompt**.
