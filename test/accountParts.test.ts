import { describe, expect, it } from "vitest";
import { CODE_WORDS } from "../src/server/accounts/codeWords";
import { decrypt, encrypt, lookupHash } from "../src/server/accounts/crypto";
import { deviceName } from "../src/server/accounts/deviceName";
import { normalizeShortCode } from "../src/server/accounts/linkTokens";
import { isPlayerName, offerNames } from "../src/server/accounts/names";
import { generateSecretCode, normalizeSecretCode } from "../src/server/accounts/secretCode";

const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="; // gitleaks:allow - test key, bytes 0 to 31

describe("secret codes", () => {
  it("has more than 1000 unique code words", () => {
    expect(new Set(CODE_WORDS).size).toBe(CODE_WORDS.length);
    expect(CODE_WORDS.length).toBeGreaterThan(1000);
  });

  it("makes codes of 3 known words and a 2-digit number", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateSecretCode();
      expect(code).toMatch(/^[a-z]+ [a-z]+ [a-z]+ \d\d$/);
      expect(normalizeSecretCode(code)).toBe(code);
    }
  });

  it("accepts any case, spacing, and dashes", () => {
    expect(normalizeSecretCode("  Acorn-TIGER   river, 42 ")).toBe("acorn tiger river 42");
    expect(normalizeSecretCode("acorn tiger river 7")).toBe("acorn tiger river 07");
  });

  it("rejects codes with unknown words or the wrong shape", () => {
    expect(normalizeSecretCode("acorn tiger river")).toBeNull();
    expect(normalizeSecretCode("acorn tiger zzzz 42")).toBeNull();
    expect(normalizeSecretCode("acorn tiger river 420")).toBeNull();
    expect(normalizeSecretCode("acorn tiger river 42 river")).toBeNull();
  });
});

describe("crypto", () => {
  it("gives the same lookup hash for the same code and pepper only", async () => {
    const hash = await lookupHash("pepper", "acorn tiger river 42");
    expect(await lookupHash("pepper", "acorn tiger river 42")).toBe(hash);
    expect(await lookupHash("other", "acorn tiger river 42")).not.toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encrypts a code so only the key can show it again", async () => {
    const box = await encrypt(KEY, "acorn tiger river 42");
    expect(box).not.toContain("acorn");
    expect(await decrypt(KEY, box)).toBe("acorn tiger river 42");
    expect(await encrypt(KEY, "acorn tiger river 42")).not.toBe(box);
  });
});

describe("player names", () => {
  it("offers 3 different names from the word lists", () => {
    const names = offerNames();
    expect(new Set(names).size).toBe(3);
    for (const name of names) expect(isPlayerName(name)).toBe(true);
  });

  it("rejects any name that is not from the word lists", () => {
    expect(isPlayerName("Swift Moss Otter")).toBe(true);
    expect(isPlayerName("swift moss otter")).toBe(false);
    expect(isPlayerName("Swift Moss")).toBe(false);
    expect(isPlayerName("Swift Moss Otter Otter")).toBe(false);
    expect(isPlayerName("Hello there friend")).toBe(false);
  });
});

describe("device names", () => {
  it("names common devices", () => {
    const iPhone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
    const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0";
    const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";

    expect(deviceName(iPhone, false)).toBe("iPhone");
    expect(deviceName(mac, false)).toBe("Chrome on Mac");
    expect(deviceName(mac, true)).toBe("iPad");
    expect(deviceName(windows, false)).toBe("Edge on Windows");
    expect(deviceName(android, false)).toBe("Android phone");
    expect(deviceName("", false)).toBe("A device");
  });
});

describe("short link codes", () => {
  it("reads a short code with any case and spacing", () => {
    expect(normalizeShortCode("ab3-k9z")).toBe("AB3K9Z");
  });

  it("rejects letters that look alike and wrong lengths", () => {
    expect(normalizeShortCode("AB0K9Z")).toBeNull();
    expect(normalizeShortCode("AB3K9")).toBeNull();
  });
});
