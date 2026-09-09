import axios from "axios";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store keys may only contain alphanumeric characters, ".", "-", and "_".
const TOKEN_STORAGE_KEY = "pa-board.auth-token";

// expo-secure-store wraps the iOS Keychain / Android Keystore and has no web
// implementation. The app targets iOS + Android; this fallback just keeps a
// `expo start --web` preview from crashing rather than being a real target.
const webTokenStore = {
  getItemAsync: async (key: string) => (Platform.OS === "web" ? window.localStorage.getItem(key) : null),
  setItemAsync: async (key: string, value: string) => {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (Platform.OS === "web") window.localStorage.removeItem(key);
  },
};

const tokenStore = Platform.OS === "web" ? webTokenStore : SecureStore;

// EXPO_PUBLIC_* vars are inlined by Expo at build time; set EXPO_PUBLIC_API_URL
// in app/.env for a physical device (localhost won't reach your dev machine).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// A conversation turn can involve transcription, several tool calls and
// speech synthesis, so the timeout is generous.
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60000,
});

apiClient.interceptors.request.use(async (requestConfig) => {
  const token = await tokenStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});

export async function saveAuthToken(token: string) {
  await tokenStore.setItemAsync(TOKEN_STORAGE_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return tokenStore.getItemAsync(TOKEN_STORAGE_KEY);
}

export async function clearAuthToken() {
  await tokenStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  timezone: string | null;
  createdAt: string;
}

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return "Something went wrong. Please try again.";
}
