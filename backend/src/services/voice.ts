import { config } from "../config";

// Voice is an input/output adapter on top of the text conversation engine
// (pa-whatsapp-spec.md section 5): speech-to-text turns a voice note into a
// normal text message; text-to-speech turns the text reply back into audio.

export function isSttConfigured(): boolean {
  return Boolean(config.voice.openaiApiKey);
}

export function isTtsConfigured(): boolean {
  return Boolean(config.voice.elevenLabsApiKey);
}

/** Transcribes an audio file with OpenAI's Whisper API. Language is
 * auto-detected, so Hebrew and English voice notes both work. */
export async function transcribeAudio(bytes: Buffer, mimeType: string, filename: string): Promise<string> {
  const apiKey = config.voice.openaiApiKey;
  if (!apiKey) throw new Error("Speech-to-text is not configured (OPENAI_API_KEY)");

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  form.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Transcription failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Synthesizes speech with ElevenLabs, returning MP3 bytes. The default model
 * (eleven_v3) covers both launch languages including Hebrew. */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const { elevenLabsApiKey, elevenLabsVoiceId, elevenLabsModelId } = config.voice;
  if (!elevenLabsApiKey) throw new Error("Text-to-speech is not configured (ELEVENLABS_API_KEY)");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": elevenLabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: elevenLabsModelId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Speech synthesis failed (${response.status}): ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
