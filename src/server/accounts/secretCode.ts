import { CODE_WORDS } from "./codeWords";
import { randomIndex, randomItem } from "./crypto";

const WORD_COUNT = 3;
const knownWords = new Set(CODE_WORDS);

export function generateSecretCode(): string {
  const words = Array.from({ length: WORD_COUNT }, () => randomItem(CODE_WORDS));
  const number = String(randomIndex(100)).padStart(2, "0");
  return [...words, number].join(" ");
}

export function normalizeSecretCode(input: string): string | null {
  const parts = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (parts.length !== WORD_COUNT + 1) return null;

  const words = parts.slice(0, WORD_COUNT);
  const number = parts[WORD_COUNT] ?? "";
  if (!words.every((word) => knownWords.has(word))) return null;
  if (!/^\d{1,2}$/.test(number)) return null;

  return [...words, number.padStart(2, "0")].join(" ");
}
