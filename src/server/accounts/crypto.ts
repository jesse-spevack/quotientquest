const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomToken(byteCount = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export function randomIndex(size: number): number {
  const limit = Math.floor(0x1_0000_0000 / size) * size;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value);
  while ((value[0] ?? 0) >= limit);
  return (value[0] ?? 0) % size;
}

export function randomItem<T>(items: readonly T[]): T {
  const item = items[randomIndex(items.length)];
  if (item === undefined) throw new Error("randomItem needs a list with items");
  return item;
}

export async function lookupHash(pepper: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toHex(new Uint8Array(signature));
}

export async function encrypt(keyBase64: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyBase64), encoder.encode(text));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decrypt(keyBase64: string, box: string): Promise<string> {
  const [iv, cipher] = box.split(".");
  if (!iv || !cipher) throw new Error("The encrypted value has the wrong shape");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    await aesKey(keyBase64),
    fromBase64Url(cipher),
  );
  return decoder.decode(plain);
}

function aesKey(keyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyBase64);
  if (raw.length !== 32) throw new Error("CODE_KEY must be 32 bytes in base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
