// Terminal rendering of the conversation, kept out of index.ts so the agent logic
// stays front and center. Prints every message sent to the model, each tool
// round-trip (compact), and the final answer.
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

function block(role: string, content: string): void {
	console.log(`[${role}]\n${content.trim()}\n`);
}

/** Header for a rendered prompt: slug, version, the label it resolved through
 *  (and the variant, if a weighted release served one), and the tool count. */
export function promptHeader(
	slug: string,
	meta: { version: number; label: string; variantName?: string },
	toolCount: number,
): string {
	const label = meta.variantName
		? `${meta.label} → ${meta.variantName}`
		: meta.label;
	return `${slug} v${meta.version} · label ${label} · ${toolCount} tools`;
}

/** Optional title, then the messages sent to the model (system / user). */
export function logPrompt(
	messages: ChatCompletionMessageParam[],
	title?: string,
): void {
	if (title) console.log(`${title}\n`);
	for (const m of messages) {
		if (typeof m.content === "string" && m.content) block(m.role, m.content);
	}
}

/** One tool round-trip — the call and its result, on compact single lines. */
export function logTool(name: string, args: unknown, result: unknown): void {
	console.log(`[tool call]   ${name} ${JSON.stringify(args)}`);
	console.log(`[tool result] ${JSON.stringify(result)}\n`);
}

/** The model's final answer. */
export function logAnswer(content: string | null): void {
	block("assistant", content ?? "");
}
