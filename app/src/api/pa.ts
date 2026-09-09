import { apiClient } from "./client";

export type MessageRole = "user" | "assistant";
export type MessageChannel = "app" | "whatsapp";

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  channel: MessageChannel;
  content: string;
  createdAt: string;
}

export async function fetchMessages(): Promise<ConversationMessage[]> {
  const { data } = await apiClient.get<{ messages: ConversationMessage[] }>("/pa/messages");
  return data.messages;
}

export async function sendMessage(
  text: string,
): Promise<{ userMessage: ConversationMessage; assistantMessage: ConversationMessage }> {
  const { data } = await apiClient.post<{ userMessage: ConversationMessage; assistantMessage: ConversationMessage }>(
    "/pa/messages",
    { text },
  );
  return data;
}
