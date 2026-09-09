import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config";

// Local-disk audio storage for v1. Paths stored on Message.audioPath are
// relative to the storage root so the root can move (or become a bucket)
// without touching rows.

const AUDIO_DIR = "audio";

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  webm: "audio/webm",
  amr: "audio/amr",
};

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/amr": "amr",
};

function storageRoot(): string {
  return path.resolve(process.cwd(), config.storageDir);
}

export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[base] ?? "bin";
}

export function mimeForPath(relativePath: string): string {
  const ext = path.extname(relativePath).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function saveAudio(bytes: Buffer, extension: string): Promise<string> {
  const relativePath = path.posix.join(AUDIO_DIR, `${crypto.randomUUID()}.${extension}`);
  const absolutePath = path.join(storageRoot(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes);
  return relativePath;
}

export async function readAudio(relativePath: string): Promise<Buffer> {
  const root = storageRoot();
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(root + path.sep)) {
    throw new Error("Invalid audio path");
  }
  return fs.readFile(absolutePath);
}
