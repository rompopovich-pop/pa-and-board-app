import { OAuth2Client, Credentials } from "google-auth-library";
import { gmail, gmail_v1 } from "@googleapis/gmail";
import { calendar, calendar_v3 } from "@googleapis/calendar";
import { config } from "../config";
import { prisma } from "../db";
import { signOAuthState } from "../utils/jwt";

// One Google connection per user covers Gmail + Calendar (spec section 6).
// gmail.modify = read, compose (drafts) and send; calendar.events = read and
// create events, which is all "availability + create events" needs.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
];

export const GOOGLE_PROVIDER = "google";

export function isGoogleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

function newOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = config.google;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/** The consent URL a user opens to connect Gmail + Calendar. Works for app
 * users (Settings) and WhatsApp-only users (the PA sends it as a link). */
export function buildGoogleConnectUrl(userId: string): string {
  return newOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state: signOAuthState(userId),
  });
}

export async function completeGoogleConnection(userId: string, code: string): Promise<string | null> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  client.setCredentials(tokens);

  const profile = await gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
  const accountEmail = profile.data.emailAddress ?? null;

  const data = {
    accountEmail,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? undefined,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: (tokens.scope ?? GOOGLE_SCOPES.join(" ")).split(" "),
  };

  await prisma.oAuthConnection.upsert({
    where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
    create: { userId, provider: GOOGLE_PROVIDER, ...data, refreshToken: tokens.refresh_token ?? null },
    update: data,
  });

  return accountEmail;
}

export async function getGoogleConnection(userId: string) {
  return prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
  });
}

/** An authorized client for this user, or null if they haven't connected.
 * Refreshed access tokens are persisted as google-auth-library issues them. */
export async function getGoogleClientForUser(userId: string): Promise<OAuth2Client | null> {
  if (!isGoogleConfigured()) return null;
  const connection = await getGoogleConnection(userId);
  if (!connection) return null;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken ?? undefined,
    expiry_date: connection.expiresAt?.getTime(),
  });

  client.on("tokens", (tokens: Credentials) => {
    prisma.oAuthConnection
      .update({
        where: { id: connection.id },
        data: {
          accessToken: tokens.access_token ?? connection.accessToken,
          refreshToken: tokens.refresh_token ?? undefined,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      })
      .catch((error) => console.error("Failed to persist refreshed Google tokens:", error));
  });

  return client;
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const connection = await getGoogleConnection(userId);
  if (!connection) return;

  try {
    await newOAuthClient().revokeToken(connection.refreshToken ?? connection.accessToken);
  } catch (error) {
    // Best effort - the row is deleted either way so the PA stops using it.
    console.warn("Google token revoke failed:", error);
  }
  await prisma.oAuthConnection.delete({ where: { id: connection.id } });
}

export function gmailFor(client: OAuth2Client): gmail_v1.Gmail {
  return gmail({ version: "v1", auth: client });
}

export function calendarFor(client: OAuth2Client): calendar_v3.Calendar {
  return calendar({ version: "v3", auth: client });
}
