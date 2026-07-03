// The app holds no prompt text — it fetches the released version from to11 and
// runs it. Prompt content lives only in to11 (see author.ts).
import { createClient } from "@to11ai/sdk";
import {
	gatewayAuthHeaders,
	gatewayPromptHeaders,
	toOpenAIMessages,
	toOpenAIToolChoice,
	toOpenAITools,
} from "@to11ai/sdk/gateway";
import OpenAI from "openai";
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions";
import { TOOL_IMPLS } from "./tools";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`set ${name}`);
	return value;
}

const TO11_API_KEY = required("TO11_API_KEY");
const TO11_PROJECT_ID = required("TO11_PROJECT_ID");
const TO11_PROVIDER = required("TO11_PROVIDER"); // connected provider slug, e.g. openai-01sj

// Optional overrides — set in .env to point at a local/self-hosted to11.
const TO11_GATEWAY_URL =
	process.env.TO11_GATEWAY_URL ?? "https://gw.to11.ai/v1"; // data plane
const TO11_API_URL = process.env.TO11_API_URL ?? "https://api.to11.ai"; // control plane
const TO11_ENV = process.env.TO11_ENV ?? "prod";

const SLUG = "weather-concierge";

// A single W3C `traceparent` (one trace-id for the whole run) on every gateway
// call groups the tool-use loop's turns into ONE trace instead of one per call;
// the per-run `x-to11-session-id` groups this run in the trace list. Ids are hex
// from Bun's Web Crypto global — no import, no dependency.
const hex = (bytes: number) =>
	[...crypto.getRandomValues(new Uint8Array(bytes))]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

const traceId = hex(16); // 32 hex — the shared grouping key
const spanId = hex(8); // 16 hex — the parent the gateway's spans nest under
const sessionId = crypto.randomUUID(); // one per run
const traceparent = `00-${traceId}-${spanId}-01`; // 01 = sampled

async function main() {
	const to11 = createClient({
		baseUrl: TO11_API_URL,
		apiKey: TO11_API_KEY,
		projectId: TO11_PROJECT_ID,
		env: TO11_ENV,
	});

	// developerRole keeps the authored `developer` block as a developer message.
	// Most variables fill `{{ }}` placeholders; one authored `renderable: false`
	// (`tier`) is only used in conditions, not substituted into the text.
	const fetched = await to11.prompts.fetch(SLUG, {
		developerRole: "developer",
		variables: {
			assistant_name: "Roker",
			city: "New York",
			units: "fahrenheit",
			user_message: "Do I need a jacket?",
			tier: "vip", // only used in conditions; never rendered into the text
		},
	});

	const version = await to11.prompts.getVersion({
		projectId: TO11_PROJECT_ID,
		promptId: fetched.promptId,
		versionNumber: fetched.version,
	});
	const cfg = (version.modelConfig ?? {}) as {
		model?: string;
		temperature?: number;
		max_tokens?: number;
	};

	const messages = toOpenAIMessages(
		fetched.messages,
	) as unknown as ChatCompletionMessageParam[];
	const tools = toOpenAITools(fetched.tools) as unknown as ChatCompletionTool[];
	// tool_choice is prompt-managed too: authored in the template, resolved onto
	// `fetched.toolChoice`, and mapped to the OpenAI field by the SDK helper.
	const toolChoice = toOpenAIToolChoice(fetched.toolChoice);

	const openai = new OpenAI({
		baseURL: TO11_GATEWAY_URL,
		apiKey: TO11_API_KEY,
		defaultHeaders: {
			...gatewayAuthHeaders({
				apiKey: TO11_API_KEY,
				projectId: TO11_PROJECT_ID,
				env: TO11_ENV,
			}),
			// Attach prompt provenance so every gen_ai span in the trace records
			// which prompt version produced it (x-to11-prompt-id / -version / …).
			...gatewayPromptHeaders(fetched),
			"x-to11-session-id": sessionId,
			traceparent,
		},
	});
	const model = `${TO11_PROVIDER}::${cfg.model ?? "gpt-4o"}`;

	console.log(
		`Fetched ${fetched.promptId} v${fetched.version} -> ${fetched.messages.length} messages, ${fetched.tools?.length ?? 0} tools\n`,
	);

	while (true) {
		const response = await openai.chat.completions.create({
			model,
			messages,
			tools,
			tool_choice: toolChoice,
			temperature: cfg.temperature ?? 0.3,
			max_tokens: cfg.max_tokens ?? 400,
		});

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
	console.error(err);
	process.exit(1);
});
