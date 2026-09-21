import { randomBytes } from "node:crypto";

import type { Profile, TokenPair } from "@/lib/api/types";

/** Tokens live here, never in the browser. In-memory: a restart signs everyone out. */
export interface SessionRecord {
  id: string;
  user: Profile;
  accessToken: string;
  /** Epoch ms. */
  accessExpiresAt: number;
  refreshToken: string;
  /** Epoch ms; the refresh token idles out at this point. */
  refreshExpiresAt: number;
  /** In-flight refresh; shared, because a replayed refresh token revokes the family. */
  refreshing?: Promise<void>;
}

const STORE_KEY = "__captureSessionStore";

type Store = Map<string, SessionRecord>;

function store(): Store {
  const g = globalThis as typeof globalThis & { [STORE_KEY]?: Store };
  // On globalThis so dev-server hot reloads do not sign everyone out.
  g[STORE_KEY] ??= new Map<string, SessionRecord>();
  return g[STORE_KEY];
}

export function createSession(tokens: TokenPair): SessionRecord {
  const now = Date.now();
  const record: SessionRecord = {
    id: randomBytes(32).toString("base64url"),
    user: tokens.user,
    accessToken: tokens.access_token,
    accessExpiresAt: now + tokens.access_expires_in * 1000,
    refreshToken: tokens.refresh_token,
    refreshExpiresAt: now + tokens.refresh_expires_in * 1000,
  };
  store().set(record.id, record);
  return record;
}

export function getSession(id: string | undefined): SessionRecord | undefined {
  if (!id) return undefined;
  const record = store().get(id);
  if (!record) return undefined;
  if (record.refreshExpiresAt <= Date.now()) {
    store().delete(id);
    return undefined;
  }
  return record;
}

export function applyTokens(record: SessionRecord, tokens: TokenPair): void {
  const now = Date.now();
  record.accessToken = tokens.access_token;
  record.accessExpiresAt = now + tokens.access_expires_in * 1000;
  record.refreshToken = tokens.refresh_token;
  record.refreshExpiresAt = now + tokens.refresh_expires_in * 1000;
  record.user = tokens.user;
}

export function destroySession(id: string | undefined): void {
  if (id) store().delete(id);
}
