// The app holds no prompt text — it renders the released version from to11 and
// runs it. Prompt content lives only in to11 (see author.ts).
//
// `format: "openai"` shapes the rendered prompt for the OpenAI client, so
// `prompt.messages` and `prompt.config` spread straight into the request — no
// converters, no manual header assembly.
import { createClient } from "@to11ai/sdk";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`set ${name}`);
	return value;
}

const TO11_PROVIDER = required("TO11_PROVIDER"); // connected provider slug, e.g. openai-01sj
const TO11_ENV = process.env.TO11_ENV ?? "prod";

const SLUG = "weather-concierge";

async function main() {
	// createClient reads TO11_API_KEY / TO11_PROJECT_ID (and TO11_GATEWAY_URL /
	// TO11_API_URL when self-hosting) from the environment.
	const to11 = createClient({ env: TO11_ENV, format: "openai" });
	const openai = new OpenAI(to11.openaiOptions());

	// Render the released prompt: the merged system message and the user turn come
	// from to11. Most variables fill `{{ }}` placeholders; `tier` is authored
	// `renderable: false`, so it only drives the Liquid `{% if %}` condition and is
	// never rendered into the text.
	const prompt = await to11.prompts.render(SLUG, {
		variables: {
			assistant_name: "Roker",
			city: "New York",
			units: "fahrenheit",
			user_message: "Do I need a jacket?",
			tier: "vip", // only used in the condition; never rendered into the text
		},
	});

	// turn().headers(prompt) returns the full bag: to11 auth, a traceparent + session
	// id, and the prompt's provenance (x-to11-prompt-id / -version / …) so the span
	// records which prompt version produced it.
	const headers = to11.turn().headers(prompt);

	// prompt.config carries the authored model + params. Prefix the model with the
	// connected provider's slug for gateway routing (step 03's mechanism).
	const model = `${TO11_PROVIDER}::${prompt.config.model ?? "gpt-4o"}`;

	console.log(
		`Rendered ${prompt.metadata.promptId} v${prompt.metadata.version} -> ${prompt.messages.length} messages\n`,
	);

	// `prompt.messages` is OpenAI-shaped; the SDK types its content as optional,
	// so cast to the client's param type to spread it in.
	const response = await openai.chat.completions.create(
		{
			...prompt.config,
			model,
			messages: prompt.messages as ChatCompletionMessageParam[],
		},
		{ headers },
	);

	console.log("ASSISTANT:", response.choices[0].message.content);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
