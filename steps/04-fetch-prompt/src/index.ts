// The app no longer contains any prompt text — it fetches the released version
// from to11 and runs it. Prompt content lives only in to11 (see author.ts).
import { createClient } from "@to11ai/sdk";
import {
	gatewayAuthHeaders,
	toOpenAIMessages,
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

async function main() {
	// Control-plane client — for fetching the released prompt + its version.
	const to11 = createClient({
		baseUrl: TO11_API_URL,
		apiKey: TO11_API_KEY,
		projectId: TO11_PROJECT_ID,
		env: TO11_ENV,
	});

	// 1. Fetch the released prompt. developerRole:"developer" keeps the authored
	//    `developer` operating-rules block as a developer message (instead of
	//    folding it to user) for providers that support the role.
	const fetched = await to11.prompts.fetch(SLUG, {
		developerRole: "developer",
		variables: {
			assistant_name: "Nigel",
			city: "New York",
			units: "fahrenheit",
			tier: "vip",
			user_message: "Do I need a jacket?",
		},
	});

	// 2. Model params come from the version's modelConfig (freeform). Tools come
	//    from the authored tool-definition blocks, lifted onto fetched.tools.
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

	// 3. Convert the fetched prompt to OpenAI shape — messages (incl. the
	//    developer role) and tools (from the authored tool blocks).
	const messages = toOpenAIMessages(
		fetched.messages,
	) as unknown as ChatCompletionMessageParam[];
	const tools = toOpenAITools(fetched.tools) as unknown as ChatCompletionTool[];

	// 4. Route through the gateway to the connected provider (TO11_PROVIDER slug).
	const openai = new OpenAI({
		baseURL: TO11_GATEWAY_URL,
		apiKey: TO11_API_KEY,
		defaultHeaders: gatewayAuthHeaders({
			apiKey: TO11_API_KEY,
			projectId: TO11_PROJECT_ID,
			env: TO11_ENV,
		}),
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
			tool_choice: "auto",
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
