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
  // Where voice notes and TTS replies are written (spec section 5).
  storageDir: process.env.STORAGE_DIR ?? "storage",
  // Voice pipeline providers - both optional; without them voice notes get a
  // text apology and replies stay text (services/voice.ts).
  voice: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3",
  },
  // Google OAuth for Gmail + Calendar (spec section 6). Optional; the PA tells
  // the user honestly when it isn't configured.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/oauth/google/callback",
  },
};
