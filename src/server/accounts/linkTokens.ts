import { lookupHash, randomItem, randomToken } from "./crypto";
import { isUniqueViolation } from "./players";

export const LINK_LIFETIME_MS = 5 * 60_000;

// No 0/O, 1/I/L, so a kid can copy the code without mix-ups.
const SHORT_CODE_LETTERS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SHORT_CODE_LENGTH = 6;
const MAX_TRIES = 5;

export type DeviceLink = { token: string; shortCode: string; expiresAt: number };

export async function createDeviceLink(env: Env, playerId: string): Promise<DeviceLink> {
  const now = Date.now();
  await env.DB.prepare("DELETE FROM link_tokens WHERE expires_at < ?").bind(now).run();

  for (let attempt = 1; ; attempt++) {
    const link = { token: randomToken(), shortCode: randomShortCode(), expiresAt: now + LINK_LIFETIME_MS };
    try {
      await env.DB.prepare(
        "INSERT INTO link_tokens (token_lookup, short_code_lookup, player_id, expires_at) VALUES (?, ?, ?, ?)",
      )
        .bind(
          await lookupHash(env.CODE_PEPPER, link.token),
          await lookupHash(env.CODE_PEPPER, link.shortCode),
          playerId,
          link.expiresAt,
        )
        .run();
      return link;
    } catch (error) {
      if (attempt >= MAX_TRIES || !isUniqueViolation(error, "link_tokens.short_code_lookup")) throw error;
    }
  }
}

export async function useDeviceLink(env: Env, proof: { token?: string; shortCode?: string }): Promise<string | null> {
  const column = proof.token ? "token_lookup" : "short_code_lookup";
  const value = proof.token ?? normalizeShortCode(proof.shortCode ?? "");
  if (!value) return null;

  const now = Date.now();
  return env.DB.prepare(
    `UPDATE link_tokens SET used_at = ?
      WHERE ${column} = ? AND used_at IS NULL AND expires_at > ?
      RETURNING player_id`,
  )
    .bind(now, await lookupHash(env.CODE_PEPPER, value), now)
    .first<string>("player_id");
}

export function normalizeShortCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== SHORT_CODE_LENGTH) return null;
  return [...code].every((letter) => SHORT_CODE_LETTERS.includes(letter)) ? code : null;
}

function randomShortCode(): string {
  return Array.from({ length: SHORT_CODE_LENGTH }, () => randomItem([...SHORT_CODE_LETTERS])).join("");
}
