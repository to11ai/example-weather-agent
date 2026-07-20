// Read a required environment variable, or print a friendly message and exit(1) —
// so a missing var surfaces as a clear one-liner instead of a stack trace.
export function requireEnv(name: string): string {
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
