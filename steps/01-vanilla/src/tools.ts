// Tool implementations: two distinct, keyless public APIs —
//   geocode_city          -> OpenStreetMap Nominatim
//   get_current_weather   -> Open-Meteo
// Identical across every step of the tutorial.

export async function geocodeCity(args: { name: string }) {
  // Nominatim is keyless but its usage policy REQUIRES a descriptive User-Agent.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", args.name);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, {
    headers: {
      "User-Agent": "to11-weather-agent-tutorial/1.0 (https://github.com/to11ai/example-weather-agent)",
    },
  });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const top = data[0];
  if (!top) throw new Error(`no geocoding result for "${args.name}"`);
  return { latitude: Number(top.lat), longitude: Number(top.lon), name: top.display_name };
}

export async function getCurrentWeather(args: {
  latitude: number;
  longitude: number;
  temperature_unit?: "fahrenheit" | "celsius";
}) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(args.latitude));
  url.searchParams.set("longitude", String(args.longitude));
  url.searchParams.set("current", "temperature_2m,wind_speed_10m,relative_humidity_2m");
  // Honor the requested unit so readings match the prompt's {{ units }}.
  url.searchParams.set("temperature_unit", args.temperature_unit ?? "fahrenheit");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forecast failed: ${res.status}`);
  const data = (await res.json()) as { current: Record<string, unknown> };
  return data.current;
}

export const TOOL_IMPLS: Record<string, (args: any) => Promise<unknown>> = {
  geocode_city: geocodeCity,
  get_current_weather: getCurrentWeather,
};
