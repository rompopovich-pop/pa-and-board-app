import Anthropic from "@anthropic-ai/sdk";

// Lazily constructed so a missing ANTHROPIC_API_KEY doesn't crash the server
// at boot - only conversation requests need it, and those fail gracefully
// (see conversationEngine.ts) rather than taking the whole process down.
let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export const CONVERSATION_MODEL = "claude-opus-5";
