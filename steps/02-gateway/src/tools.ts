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
// application code, not in the managed prompt. The descriptions tell the model how
// to use and CHAIN the tools (geocode first, then feed the coordinates to the
// weather lookup) — the model has only these strings to reason from.
export const TOOLS: ChatCompletionTool[] = [
	{
		type: "function",
		function: {
			name: "geocode_city",
			description:
				"Resolve a city or place name to geographic coordinates. Call this FIRST " +
				"whenever the user names a location, then pass the returned latitude and " +
				"longitude to get_current_weather. Returns { latitude, longitude, name }.",
			parameters: {
				type: "object",
				required: ["name"],
				properties: {
					name: {
						type: "string",
						description:
							"City or place name, e.g. 'New York' or 'Paris, France'.",
					},
				},
			},
		},
	},
	{
		type: "function",
		function: {
			name: "get_current_weather",
			description:
				"Get the CURRENT weather (temperature, wind speed, humidity) for a " +
				"latitude/longitude — normally the coordinates returned by geocode_city, " +
				"so call that first if you only have a place name. Reports current " +
				"conditions only, not a forecast.",
			parameters: {
				type: "object",
				required: ["latitude", "longitude"],
				properties: {
					latitude: {
						type: "number",
						description: "Latitude, e.g. from geocode_city's result.",
					},
					longitude: {
						type: "number",
						description: "Longitude, e.g. from geocode_city's result.",
					},
					temperature_unit: {
						type: "string",
						enum: ["fahrenheit", "celsius"],
						description:
							"Unit for the temperature reading; match the units the user asked for.",
					},
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
