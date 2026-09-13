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

/** The connected calendar's own timezone. events.list hands this back under
 * the calendar.events scope we already hold, so no extra consent is needed
 * (calendar.readonly would work too, but grants far more than one field). */
export async function fetchCalendarTimezone(client: OAuth2Client): Promise<string | null> {
  try {
    const now = new Date();
    const res = await calendar({ version: "v3", auth: client }).events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + 60_000).toISOString(),
      maxResults: 1,
    });
    return res.data.timeZone ?? null;
  } catch (error) {
    // Never fail the connection over this - the PA just keeps using
    // users.timezone, exactly as it did before.
    console.warn("Could not read calendar timezone:", error);
    return null;
  }
}

export async function completeGoogleConnection(userId: string, code: string): Promise<string | null> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  client.setCredentials(tokens);

  const profile = await gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
  const accountEmail = profile.data.emailAddress ?? null;
  const calendarTimezone = await fetchCalendarTimezone(client);

  const data = {
    accountEmail,
    calendarTimezone,
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

  // Adopt the calendar's timezone when we don't have one - that's strictly
  // better than defaulting to UTC and silently scheduling at the wrong hour.
  // When the two disagree, leave the user's value alone and let the PA raise
  // it (buildSystemPrompt), since only they can say which is right.
  if (calendarTimezone) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && !user.timezone) {
      await prisma.user.update({ where: { id: userId }, data: { timezone: calendarTimezone } });
    }
  }

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
