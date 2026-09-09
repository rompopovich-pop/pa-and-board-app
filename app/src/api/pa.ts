import { Platform } from "react-native";
import { apiClient } from "./client";

export type MessageRole = "user" | "assistant";
export type MessageChannel = "app" | "whatsapp";
export type MessageModality = "text" | "voice";

export interface EmailDraftMetadata {
  type: "email_draft";
  draftId: string;
  to: string;
  subject: string;
  body: string;
  status: "pending" | "sent" | "discarded";
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  channel: MessageChannel;
  modality: MessageModality;
  content: string;
  /** Relative API path (e.g. /pa/messages/<id>/audio); needs the auth header. */
  audioUrl: string | null;
  metadata: EmailDraftMetadata | Record<string, unknown> | null;
  createdAt: string;
}

export interface TurnResponse {
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
}

export function isEmailDraft(metadata: ConversationMessage["metadata"]): metadata is EmailDraftMetadata {
  return Boolean(metadata && (metadata as EmailDraftMetadata).type === "email_draft");
}

export async function fetchMessages(): Promise<ConversationMessage[]> {
  const { data } = await apiClient.get<{ messages: ConversationMessage[] }>("/pa/messages");
  return data.messages;
}

export async function sendMessage(text: string): Promise<TurnResponse> {
  const { data } = await apiClient.post<TurnResponse>("/pa/messages", { text });
  return data;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  caf: "audio/x-caf",
  webm: "audio/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
};

/** Uploads a recorded voice note; the backend transcribes it, runs the same
 * conversation engine, and replies in kind with audio when it can. */
export async function sendVoiceMessage(fileUri: string): Promise<TurnResponse> {
  const extension = fileUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "m4a";
  const mimeType = MIME_BY_EXTENSION[extension] ?? "audio/mp4";
  const filename = `voice.${extension}`;

  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(fileUri)).blob();
    form.append("audio", blob, filename);
  } else {
    // React Native's FormData takes a { uri, name, type } descriptor for files.
    form.append("audio", { uri: fileUri, name: filename, type: mimeType } as unknown as Blob);
  }

  const { data } = await apiClient.post<TurnResponse>("/pa/messages/voice", form, {
    headers: Platform.OS === "web" ? undefined : { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function sendDraft(draftId: string): Promise<ConversationMessage> {
  const { data } = await apiClient.post<{ assistantMessage: ConversationMessage }>(`/pa/drafts/${draftId}/send`);
  return data.assistantMessage;
}

export async function discardDraft(draftId: string): Promise<ConversationMessage> {
  const { data } = await apiClient.post<{ assistantMessage: ConversationMessage }>(`/pa/drafts/${draftId}/discard`);
  return data.assistantMessage;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export async function fetchGoogleStatus(): Promise<GoogleStatus> {
  const { data } = await apiClient.get<GoogleStatus>("/oauth/google/status");
  return data;
}

export async function fetchGoogleConnectUrl(): Promise<string> {
  const { data } = await apiClient.get<{ url: string }>("/oauth/google/start");
  return data.url;
}

export async function disconnectGoogle(): Promise<void> {
  await apiClient.delete("/oauth/google");
}
