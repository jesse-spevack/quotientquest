import { lookupHash, randomToken } from "./crypto";
import type { Player } from "./players";

export const SESSION_COOKIE = "qq_session";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Browsers cap cookie lifetimes at 400 days.
const REMEMBERED_DAYS = 400;
const SHARED_DEVICE_IDLE = DAY;
const LAST_SEEN_STEP = 5 * MINUTE;

export type Session = { player: Player; deviceId: string; remember: boolean };

export type Device = { id: string; name: string; lastSeenAt: number };

type SessionRow = {
  device_id: string;
  remember: number;
  last_seen_at: number;
  player_id: string;
  player_name: string;
};

export async function startSession(env: Env, playerId: string, deviceName: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO devices (id, player_id, token_lookup, name, remember, created_at, last_seen_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
  )
    .bind(crypto.randomUUID(), playerId, await lookupHash(env.CODE_PEPPER, token), deviceName, now, now)
    .run();
  return token;
}

export async function findSession(env: Env, request: Request): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT devices.id AS device_id, devices.remember, devices.last_seen_at,
            players.id AS player_id, players.name AS player_name
       FROM devices JOIN players ON players.id = devices.player_id
      WHERE devices.token_lookup = ?`,
  )
    .bind(await lookupHash(env.CODE_PEPPER, token))
    .first<SessionRow>();
  if (!row) return null;

  const now = Date.now();
  const remember = row.remember === 1;
  const idleLimit = remember ? REMEMBERED_DAYS * DAY : SHARED_DEVICE_IDLE;
  if (now - row.last_seen_at > idleLimit) {
    await endSession(env, row.device_id);
    return null;
  }
  if (now - row.last_seen_at > LAST_SEEN_STEP) {
    await env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(now, row.device_id).run();
  }

  return { player: { id: row.player_id, name: row.player_name }, deviceId: row.device_id, remember };
}

export async function rememberDevice(env: Env, deviceId: string, remember: boolean): Promise<void> {
  await env.DB.prepare("UPDATE devices SET remember = ? WHERE id = ?")
    .bind(remember ? 1 : 0, deviceId)
    .run();
}

export async function endSession(env: Env, deviceId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(deviceId).run();
}

export async function endPlayerSession(env: Env, playerId: string, deviceId: string): Promise<boolean> {
  const result = await env.DB.prepare("DELETE FROM devices WHERE id = ? AND player_id = ?")
    .bind(deviceId, playerId)
    .run();
  return result.meta.changes > 0;
}

export async function listDevices(env: Env, playerId: string): Promise<Device[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, last_seen_at AS lastSeenAt FROM devices WHERE player_id = ? ORDER BY last_seen_at DESC",
  )
    .bind(playerId)
    .all<Device>();
  return results;
}

export function sessionCookie(token: string, remember: boolean): string {
  const lifetime = remember ? `; Max-Age=${REMEMBERED_DAYS * 24 * 60 * 60}` : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${lifetime}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}
