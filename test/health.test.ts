import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("reports the game name from D1", async () => {
  const response = await exports.default.fetch("https://example.com/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, game: "Quotient Quest" });
});

it("returns 404 for an unknown API path", async () => {
  const response = await exports.default.fetch("https://example.com/api/nothing");

  expect(response.status).toBe(404);
});
