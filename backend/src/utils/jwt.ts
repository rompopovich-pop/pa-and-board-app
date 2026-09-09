import jwt from "jsonwebtoken";
import { config } from "../config";

const TOKEN_TTL = "30d";

export interface AuthTokenPayload {
  userId: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
}

// Short-lived signed `state` for the Google OAuth round trip. Binding the
// user id into the state (rather than a session) is what lets a WhatsApp-only
// user, who has no app session, connect Google from a link the PA sends.
const OAUTH_STATE_TTL = "15m";

export function signOAuthState(userId: string): string {
  return jwt.sign({ userId, purpose: "google_oauth" }, config.jwtSecret, { expiresIn: OAUTH_STATE_TTL });
}

export function verifyOAuthState(state: string): string {
  const payload = jwt.verify(state, config.jwtSecret) as { userId?: string; purpose?: string };
  if (payload.purpose !== "google_oauth" || !payload.userId) {
    throw new Error("Invalid OAuth state");
  }
  return payload.userId;
}
