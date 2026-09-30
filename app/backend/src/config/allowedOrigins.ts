/** Browser origins allowed by CORS (ALLOWED_ORIGINS, comma-separated) and by dev-login. */
export function getAllowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return [
    "https://ca-pronghorn-frontend.orangeplant-ff11f103.canadacentral.azurecontainerapps.io",
    "https://pronghorn.blue",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:3000",
  ];
}
