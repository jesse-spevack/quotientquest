import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import type { NamesResponse, SignUpResponse } from "../src/shared/account";

const ORIGIN = "https://example.com";
let nextAddress = 1;

export function newAddress(): string {
  nextAddress += 1;
  return `203.0.113.${nextAddress % 250}-${nextAddress}`;
}

type CallOptions = { method?: string; body?: unknown; cookie?: string; address?: string; origin?: string };

export function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers({
    "CF-Connecting-IP": options.address ?? newAddress(),
    "User-Agent": "Chrome/140 Macintosh",
  });
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.origin) headers.set("Origin", options.origin);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function sessionFrom(response: Response): string {
  const header = response.headers.get("Set-Cookie") ?? "";
  const match = /qq_session=([^;]*)/.exec(header);
  if (!match?.[1]) throw new Error(`No session cookie in "${header}"`);
  return `qq_session=${match[1]}`;
}

export async function signUp(): Promise<{ cookie: string; secretCode: string; name: string }> {
  const { names } = await (await call("/api/names")).json<NamesResponse>();
  const name = names[0] ?? "";
  const response = await call("/api/players", { body: { name } });
  expect(response.status).toBe(201);
  const body = await response.json<SignUpResponse>();
  return { cookie: sessionFrom(response), secretCode: body.secretCode, name: body.player.name };
}
