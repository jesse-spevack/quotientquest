import { decrypt, encrypt, lookupHash } from "./crypto";
import { generateSecretCode, normalizeSecretCode } from "./secretCode";

export type Player = { id: string; name: string };

const MAX_CODE_TRIES = 5;

export async function createPlayer(env: Env, name: string): Promise<{ player: Player; secretCode: string } | null> {
  const player = { id: crypto.randomUUID(), name };
  try {
    const secretCode = await storeNewCode(env, (lookup, box) =>
      env.DB.prepare("INSERT INTO players (id, name, code_lookup, code_box, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(player.id, player.name, lookup, box, Date.now())
        .run(),
    );
    return { player, secretCode };
  } catch (error) {
    if (isUniqueViolation(error, "players.name")) return null;
    throw error;
  }
}

export async function findPlayerByCode(env: Env, input: string): Promise<Player | null> {
  const code = normalizeSecretCode(input);
  if (!code) return null;
  const lookup = await lookupHash(env.CODE_PEPPER, code);
  return env.DB.prepare("SELECT id, name FROM players WHERE code_lookup = ?").bind(lookup).first<Player>();
}

export async function readSecretCode(env: Env, playerId: string): Promise<string> {
  const box = await env.DB.prepare("SELECT code_box FROM players WHERE id = ?")
    .bind(playerId)
    .first<string>("code_box");
  if (!box) throw new Error("The player has no secret code");
  return decrypt(env.CODE_KEY, box);
}

export function replaceSecretCode(env: Env, playerId: string): Promise<string> {
  return storeNewCode(env, (lookup, box) =>
    env.DB.prepare("UPDATE players SET code_lookup = ?, code_box = ? WHERE id = ?").bind(lookup, box, playerId).run(),
  );
}

async function storeNewCode(env: Env, save: (lookup: string, box: string) => Promise<unknown>): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const code = generateSecretCode();
    const lookup = await lookupHash(env.CODE_PEPPER, code);
    try {
      await save(lookup, await encrypt(env.CODE_KEY, code));
      return code;
    } catch (error) {
      if (attempt >= MAX_CODE_TRIES || !isUniqueViolation(error, "players.code_lookup")) throw error;
    }
  }
}

export function isUniqueViolation(error: unknown, column: string): boolean {
  return error instanceof Error && error.message.includes(`UNIQUE constraint failed: ${column}`);
}
