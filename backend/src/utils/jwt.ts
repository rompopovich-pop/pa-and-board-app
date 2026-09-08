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
