import { apiClient } from "./client";

// Business Board API (business-board-spec.md sections 4-6, Phase 1). The
// board's fields are generated per business, so the client is deliberately
// schema-agnostic: it renders whatever `fields` the board says it has.

export type BoardFieldType = "text" | "long_text" | "number" | "date" | "select" | "phone" | "email" | "checkbox";
export type StatusTone = "new" | "active" | "needs_follow_up" | "inactive";

export interface BoardField {
  key: string;
  label: string;
  type: BoardFieldType;
  options: string[];
  required: boolean;
  /** `name` and `general_info` - present on every board, rendered specially. */
  isSystem: boolean;
}

export interface BoardStatus {
  key: string;
  label: string;
  tone: StatusTone;
}

export interface FollowUpRule {
  days: number;
  basis: "last_session" | "last_contact";
  description: string;
}

export interface Board {
  id: string;
  name: string;
  clientNoun: string;
  clientNounPlural: string;
  statuses: BoardStatus[];
  followUpRule: FollowUpRule | null;
  summary: string;
  assumptions: string | null;
  fields: BoardField[];
  business: {
    id: string;
    name: string;
    description: string;
    businessType: string;
    /** Language the description (and so every generated label) is in. */
    language: string;
  };
  clientCount: number;
  createdAt: string;
}

export type FieldValue = string | number | boolean | null;
export type ClientFields = Record<string, FieldValue>;

export interface BoardClient {
  id: string;
  name: string;
  status: string;
  fields: ClientFields;
  lastActivityAt: string | null;
  lastSessionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ActivityKind = "note" | "session" | "status_change" | "created" | "updated";

export interface ClientActivity {
  id: string;
  kind: ActivityKind;
  text: string;
  createdAt: string;
}

export async function fetchBoard(): Promise<Board | null> {
  const { data } = await apiClient.get<{ board: Board | null }>("/board");
  return data.board;
}

/** The whole setup step: a description in, a generated board out. Slow (a
 * model call), so the timeout is longer than the default. */
export async function generateBoard(description: string): Promise<Board> {
  const { data } = await apiClient.post<{ board: Board }>("/board/generate", { description }, { timeout: 120000 });
  return data.board;
}

export async function fetchClients(params: { status?: string; q?: string } = {}): Promise<BoardClient[]> {
  const { data } = await apiClient.get<{ clients: BoardClient[] }>("/board/clients", { params });
  return data.clients;
}

export async function fetchClient(clientId: string): Promise<{ client: BoardClient; activities: ClientActivity[] }> {
  const { data } = await apiClient.get<{ client: BoardClient; activities: ClientActivity[] }>(`/board/clients/${clientId}`);
  return data;
}

export async function createClient(input: { status?: string; fields: Record<string, unknown> }): Promise<BoardClient> {
  const { data } = await apiClient.post<{ client: BoardClient }>("/board/clients", input);
  return data.client;
}

export async function updateClient(
  clientId: string,
  input: { status?: string; fields?: Record<string, unknown> },
): Promise<BoardClient> {
  const { data } = await apiClient.patch<{ client: BoardClient }>(`/board/clients/${clientId}`, input);
  return data.client;
}

export async function deleteClient(clientId: string): Promise<void> {
  await apiClient.delete(`/board/clients/${clientId}`);
}

export async function addActivity(
  clientId: string,
  kind: "note" | "session",
  text: string,
): Promise<{ activity: ClientActivity; client: BoardClient }> {
  const { data } = await apiClient.post<{ activity: ClientActivity; client: BoardClient }>(
    `/board/clients/${clientId}/activities`,
    { kind, text },
  );
  return data;
}

/** Field-level validation errors come back as { error, key }. */
export function extractFieldKey(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { key?: string } } })?.response?.data;
  return typeof data?.key === "string" ? data.key : undefined;
}
