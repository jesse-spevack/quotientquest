import { clientKey } from "../http";
import { lookupHash } from "./crypto";

// A full classroom with typos stays far below this; a guesser on one address gets 300 tries a day.
export const DAILY_FAILED_GUESSES = 300;

const DAY = 24 * 60 * 60_000;

function today(): number {
  return Math.floor(Date.now() / DAY);
}

async function counterKey(env: Env, request: Request, day: number): Promise<string> {
  return lookupHash(env.CODE_PEPPER, `failed-guesses:${day}:${clientKey(request)}`);
}

export async function hasGuessesLeft(env: Env, request: Request): Promise<boolean> {
  const day = today();
  const count = await env.DB.prepare("SELECT count FROM failed_guesses WHERE key = ?")
    .bind(await counterKey(env, request, day))
    .first<number>("count");
  return (count ?? 0) < DAILY_FAILED_GUESSES;
}

export async function recordFailedGuess(env: Env, request: Request): Promise<void> {
  const day = today();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM failed_guesses WHERE day < ?").bind(day),
    env.DB.prepare(
      `INSERT INTO failed_guesses (key, day, count) VALUES (?, ?, 1)
       ON CONFLICT (key) DO UPDATE SET count = count + 1`,
    ).bind(await counterKey(env, request, day), day),
  ]);
}
