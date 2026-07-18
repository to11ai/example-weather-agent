# Step 01 — Vanilla weather agent (no to11)

The starting point: a weather-concierge agent talking directly to OpenAI. The whole prompt
lives in application code as a `system` + `user` message pair. No to11 yet.

## Goal

Run an agent that takes a city + question and answers with a single OpenAI chat completion —
end to end against OpenAI.

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

```
ASSISTANT: It's mild in New York right now — a light jacket is plenty. For a VIP touch, pack a compact umbrella in case a shower rolls through.
```

(Wording varies. The VIP tier adds the packing suggestion.)

## How it works

- `src/index.ts` — merges the persona and the operating rules into one `system` message
  (the VIP line is added by a hand-coded conditional), puts the live question in a `user`
  message, and makes a single `chat.completions` call.

## What this step teaches — and its pain points

This works, but everything to11 fixes is visible here:

- **The prompt is buried in code.** The persona, the operating rules, and the VIP branch are
  all hardcoded in `index.ts`. Changing wording means a code change and a redeploy.
- **The VIP rule is a hand-written `if`.** to11 expresses this as a Liquid `{% if %}`
  condition inside the authored prompt instead.
- **No observability.** You can't see what was sent, what it cost, or how long it took
  without bolting on your own logging.
- **No versioning or provenance.** There's no way to know which prompt produced which answer,
  roll back a bad change, or A/B a variant.

## Next

[Step 02](../02-gateway) routes this exact call through the to11 gateway — full
request/response telemetry with **zero changes to the prompt**.
