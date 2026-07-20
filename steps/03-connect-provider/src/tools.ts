// Tool implementations + definitions: two distinct, keyless public APIs —
//   geocode_city          -> OpenStreetMap Nominatim
//   get_current_weather   -> Open-Meteo
// The definitions (the schemas the model sees) live here in application code, not
// in the managed prompt. Identical across every step of the tutorial.
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export async function geocodeCity(args: { name: string }) {
	// Nominatim is keyless but its usage policy REQUIRES a descriptive User-Agent.
	const url = new URL("https://nominatim.openstreetmap.org/search");
	url.searchParams.set("q", args.name);
	url.searchParams.set("format", "json");
	url.searchParams.set("limit", "1");
	const res = await fetch(url, {
		headers: {
			"User-Agent":
				"to11-weather-agent-tutorial/1.0 (https://github.com/to11ai/example-weather-agent)",
		},
	});
	if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
	const data = (await res.json()) as Array<{
		lat: string;
		lon: string;
		display_name: string;
	}>;
	const top = data[0];
	if (!top) throw new Error(`no geocoding result for "${args.name}"`);
	return {
		latitude: Number(top.lat),
		longitude: Number(top.lon),
		name: top.display_name,
	};
}

export async function getCurrentWeather(args: {
	latitude: number;
	longitude: number;
	temperature_unit?: "fahrenheit" | "celsius";
}) {
	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.searchParams.set("latitude", String(args.latitude));
	url.searchParams.set("longitude", String(args.longitude));
	url.searchParams.set(
		"current",
		"temperature_2m,wind_speed_10m,relative_humidity_2m",
	);
	// Honor the requested unit so readings match the prompt's {{ units }}.
	url.searchParams.set(
		"temperature_unit",
		args.temperature_unit ?? "fahrenheit",
	);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`forecast failed: ${res.status}`);
	const data = (await res.json()) as { current: Record<string, unknown> };
	return data.current;
}

// Tool definitions — the schemas offered to the model on every call. These live in
// application code, not in the managed prompt.
export const TOOLS: ChatCompletionTool[] = [
	{
		type: "function",
		function: {
			name: "geocode_city",
			description: "Resolve a city name to latitude/longitude.",
			parameters: {
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
			},
		},
	},
	{
		type: "function",
		function: {
			name: "get_current_weather",
			description: "Current weather for a latitude/longitude.",
			parameters: {
				type: "object",
				required: ["latitude", "longitude"],
				properties: {
					latitude: { type: "number" },
					longitude: { type: "number" },
					temperature_unit: { type: "string", enum: ["fahrenheit", "celsius"] },
				},
			},
		},
	},
];

// biome-ignore lint/suspicious/noExplicitAny: tool args are JSON-parsed and vary per tool
export const TOOL_IMPLS: Record<string, (args: any) => Promise<unknown>> = {
	geocode_city: geocodeCity,
	get_current_weather: getCurrentWeather,
};
