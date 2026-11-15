import type { ErrorCode } from "../shared/account";

const MAX_BODY_BYTES = 2048;

export function json(data: unknown, init: { status?: number; cookie?: string } = {}): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (init.cookie) headers.set("Set-Cookie", init.cookie);
  return Response.json(data, { status: init.status ?? 200, headers });
}

export function fail(error: ErrorCode, status: number, cookie?: string): Response {
  return json({ error }, { status, cookie });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text || "{}");
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

export function clientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}
