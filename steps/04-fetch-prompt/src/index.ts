// The app holds no prompt text — it renders the released version from to11 and
// runs it. Prompt content lives only in to11 (see author.ts). The tool
// DEFINITIONS, though, stay in application code (tools.ts): the loaded prompt
// carries no tools, and the app offers them on the call and runs them when the
// model asks.
//
// `format: "openai"` shapes the rendered prompt for the OpenAI client, so
// `prompt.messages` and `prompt.config` spread straight into the request.
import { createClient } from "@to11ai/sdk";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { TOOL_IMPLS, TOOLS } from "./tools";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(
			`Missing required environment variable: ${name}\n` +
				"Copy .env.example to .env and fill it in, then re-run.",
		);
		process.exit(1);
	}
	return value;
}

const TO11_PROVIDER = requireEnv("TO11_PROVIDER"); // connected provider slug, e.g. openai-01sj

const SLUG = "weather-concierge";

async function main() {
	// createClient reads TO11_API_KEY / TO11_PROJECT_ID / TO11_ENV (and the
	// TO11_GATEWAY_URL / TO11_API_URL overrides when self-hosting) from the environment.
	const to11 = createClient({ format: "openai" });
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

	// One turn for the whole run. headers(prompt) returns the full bag: to11 auth, a
	// single traceparent + session id (so the tool loop is ONE trace), and the
	// prompt's provenance (x-to11-prompt-id / -version / …). Hoist it so every call
	// reuses the same ids.
	const headers = to11.turn().headers(prompt);

	// prompt.config carries the authored model + params. Prefix the model with the
	// connected provider's slug for gateway routing (step 03's mechanism).
	const model = `${TO11_PROVIDER}::${prompt.config.model ?? "gpt-4o"}`;

	// `prompt.messages` is OpenAI-shaped; the SDK types its content as optional, so
	// cast to the client's param type for the mutable loop accumulator.
	const messages = [...prompt.messages] as ChatCompletionMessageParam[];

	console.log(
		`Rendered ${prompt.metadata.promptId} v${prompt.metadata.version} -> ${messages.length} messages; ${TOOLS.length} tools from code\n`,
	);

	while (true) {
		// tools + tool_choice come from application code, not the prompt.
		const response = await openai.chat.completions.create(
			{
				// App-side fallbacks first; anything the version authored in
				// prompt.config overrides them, and the routed model wins last.
				temperature: 0.3,
				max_tokens: 400,
				...prompt.config,
				model,
				messages,
				tools: TOOLS,
				tool_choice: "auto",
			},
			{ headers },
		);

		const msg = response.choices[0].message;
		messages.push(msg); // replay the assistant turn (carries any tool_calls)

		if (!msg.tool_calls?.length) {
			console.log("ASSISTANT:", msg.content);
			return;
		}

		for (const call of msg.tool_calls) {
			const args = JSON.parse(call.function.arguments);
			const result = await TOOL_IMPLS[call.function.name](args);
			console.log(
				`  [tool] ${call.function.name}(${JSON.stringify(args)}) ->`,
				result,
			);
			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: JSON.stringify(result),
			});
		}
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
