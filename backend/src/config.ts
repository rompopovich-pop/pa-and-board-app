import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  // WhatsApp Cloud API - all optional so the server still boots without them
  // (e.g. local dev on the app channel only). Each is checked at the point
  // of use; see services/whatsapp.ts and routes/whatsapp.ts.
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
  },
  reminderPollIntervalMs: Number(process.env.REMINDER_POLL_INTERVAL_MS ?? 30_000),
};
