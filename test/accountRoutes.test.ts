import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DAILY_FAILED_GUESSES, recordFailedGuess } from "../src/server/accounts/guessGuard";
import type {
  DeviceLinkResponse,
  DevicesResponse,
  MeResponse,
  SecretCodeResponse,
  SignInResponse,
  SignUpResponse,
} from "../src/shared/account";
import { call, newAddress, sessionFrom, signUp } from "./accountApi";

describe("sign-up", () => {
  it("creates a player, shows the secret code, and signs in this device", async () => {
    const { cookie, secretCode, name } = await signUp();

    expect(secretCode).toMatch(/^[a-z]+ [a-z]+ [a-z]+ \d\d$/);
    const me = await (await call("/api/me", { cookie })).json<MeResponse>();
    expect(me).toEqual({ player: { name }, remember: false });
  });

  it("stores no secret code in plain text", async () => {
    const { secretCode, name } = await signUp();

    const row = await env.DB.prepare("SELECT code_lookup, code_box FROM players WHERE name = ?").bind(name).first();
    expect(JSON.stringify(row)).not.toContain(secretCode.split(" ")[0]);
  });

  it("rejects a name that is not from the word lists", async () => {
    const response = await call("/api/players", { body: { name: "Mean Words Here" } });

    expect(response.status).toBe(400);
  });

  it("refuses a name that another player has", async () => {
    const { name } = await signUp();

    const response = await call("/api/players", { body: { name } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "name_taken" });
  });

  it("lets a classroom of 30 kids behind one address sign up and sign in", async () => {
    const address = newAddress();
    const codes: string[] = [];
    for (let kid = 0; kid < 30; kid++) {
      const { names } = await (await call("/api/names")).json<{ names: string[] }>();
      const response = await call("/api/players", { body: { name: names[0] }, address });
      expect(response.status).toBe(201);
      codes.push((await response.json<SignUpResponse>()).secretCode);
    }
    for (const code of codes) {
      expect((await call("/api/sign-in", { body: { code }, address })).status).toBe(200);
    }
  });

  it("limits sign-ups from one address to 40 a minute", async () => {
    const address = newAddress();
    const statuses: number[] = [];
    for (let i = 0; i < 41; i++) {
      const { names } = await (await call("/api/names")).json<{ names: string[] }>();
      statuses.push((await call("/api/players", { body: { name: names[0] }, address })).status);
    }

    expect(statuses.slice(0, 40).every((status) => status === 201 || status === 409)).toBe(true);
    expect(statuses[40]).toBe(429);
  });
});

describe("sign-in with the secret code", () => {
  it("signs in a second device with the code in any format", async () => {
    const { secretCode, name } = await signUp();

    const response = await call("/api/sign-in", { body: { code: secretCode.toUpperCase().replaceAll(" ", "-") } });

    expect(response.status).toBe(200);
    expect(await response.json<SignInResponse>()).toEqual({ player: { name } });
    const me = await (await call("/api/me", { cookie: sessionFrom(response) })).json<MeResponse>();
    expect(me.player).toEqual({ name });
  });

  it("says the code is wrong without a session", async () => {
    const response = await call("/api/sign-in", { body: { code: "acorn acorn acorn 00" } });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "wrong_code" });
  });

  it("asks a fast guesser to wait after 60 tries in a minute", async () => {
    const address = newAddress();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await call("/api/sign-in", { body: { code: "acorn acorn acorn 00" }, address })).status);
    }

    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(401));
    expect(statuses[60]).toBe(429);
  });

  it("stops an address after 300 wrong guesses in a day, even with the right code", async () => {
    const { secretCode } = await signUp();
    const address = newAddress();
    const guesser = new Request("https://example.com/api/sign-in", { headers: { "CF-Connecting-IP": address } });
    for (let i = 0; i < DAILY_FAILED_GUESSES; i++) await recordFailedGuess(env, guesser);

    expect((await call("/api/sign-in", { body: { code: secretCode }, address })).status).toBe(429);
    expect((await call("/api/link/redeem", { body: { shortCode: "ABCDEF" }, address })).status).toBe(429);
    expect((await call("/api/sign-in", { body: { code: secretCode } })).status).toBe(200);
  });

  it("counts wrong link codes as wrong guesses", async () => {
    const address = newAddress();
    await call("/api/link/redeem", { body: { shortCode: "ABCDEF" }, address });

    const rows = await env.DB.prepare("SELECT SUM(count) AS total FROM failed_guesses").first<number>("total");
    expect(rows).toBeGreaterThan(0);
    expect(JSON.stringify(await env.DB.prepare("SELECT key FROM failed_guesses").all())).not.toContain("203.0.113");
  });
});

describe("remember this device", () => {
  it("keeps the session after the browser closes only when the player says yes", async () => {
    const { cookie } = await signUp();

    const yes = await call("/api/session/remember", { body: { remember: true }, cookie });
    expect(yes.headers.get("Set-Cookie")).toMatch(/Max-Age=34560000/);
    expect(yes.headers.get("Set-Cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect((await (await call("/api/me", { cookie })).json<MeResponse>()).remember).toBe(true);

    const no = await call("/api/session/remember", { body: { remember: false }, cookie });
    expect(no.headers.get("Set-Cookie")).not.toMatch(/Max-Age/);
  });

  it("ends a shared-device session after a day without play", async () => {
    const { cookie, name } = await signUp();
    await env.DB.prepare(
      "UPDATE devices SET last_seen_at = ? WHERE player_id = (SELECT id FROM players WHERE name = ?)",
    )
      .bind(Date.now() - 25 * 60 * 60_000, name)
      .run();

    expect((await (await call("/api/me", { cookie })).json<MeResponse>()).player).toBeNull();
  });
});

describe("the secret code in Settings", () => {
  it("shows the code again and makes a new one that replaces it", async () => {
    const { cookie, secretCode } = await signUp();

    const shown = await (await call("/api/me/code", { cookie })).json<SecretCodeResponse>();
    expect(shown.secretCode).toBe(secretCode);

    const fresh = await (await call("/api/me/code", { method: "POST", cookie })).json<SecretCodeResponse>();
    expect(fresh.secretCode).not.toBe(secretCode);
    expect((await call("/api/sign-in", { body: { code: secretCode } })).status).toBe(401);
    expect((await call("/api/sign-in", { body: { code: fresh.secretCode } })).status).toBe(200);
  });
});

describe("devices", () => {
  it("lists each signed-in device and marks this one", async () => {
    const { cookie, secretCode } = await signUp();
    await call("/api/sign-in", { body: { code: secretCode } });

    const { devices } = await (await call("/api/devices", { cookie })).json<DevicesResponse>();

    expect(devices).toHaveLength(2);
    expect(devices.filter((device) => device.current)).toHaveLength(1);
    expect(devices[0]?.name).toBe("Chrome on Mac");
  });

  it("signs out another device", async () => {
    const { cookie, secretCode } = await signUp();
    const other = sessionFrom(await call("/api/sign-in", { body: { code: secretCode } }));
    const { devices } = await (await call("/api/devices", { cookie })).json<DevicesResponse>();
    const otherDevice = devices.find((device) => !device.current);

    const response = await call(`/api/devices/${otherDevice?.id}`, { method: "DELETE", cookie });

    expect(response.status).toBe(200);
    expect((await (await call("/api/me", { cookie: other })).json<MeResponse>()).player).toBeNull();
    expect((await (await call("/api/me", { cookie })).json<MeResponse>()).player).not.toBeNull();
  });

  it("cannot sign out a device of another player", async () => {
    const first = await signUp();
    const second = await signUp();
    const { devices } = await (await call("/api/devices", { cookie: second.cookie })).json<DevicesResponse>();

    const response = await call(`/api/devices/${devices[0]?.id}`, { method: "DELETE", cookie: first.cookie });

    expect(response.status).toBe(404);
    expect((await (await call("/api/me", { cookie: second.cookie })).json<MeResponse>()).player).not.toBeNull();
  });

  it("signs out here and clears the cookie", async () => {
    const { cookie } = await signUp();

    const response = await call("/api/sign-out", { method: "POST", cookie });

    expect(response.headers.get("Set-Cookie")).toMatch(/qq_session=; .*Max-Age=0/);
    expect((await (await call("/api/me", { cookie })).json<MeResponse>()).player).toBeNull();
  });
});

describe("add a device with a link", () => {
  async function newLink(cookie: string) {
    return (await call("/api/link", { method: "POST", cookie })).json<DeviceLinkResponse>();
  }

  it("signs in a new device with the link token once", async () => {
    const { cookie, name } = await signUp();
    const link = await newLink(cookie);
    const token = link.url.split("#")[1];
    expect(link.url).toMatch(/^https:\/\/example\.com\/link#/);

    const first = await call("/api/link/redeem", { body: { token } });
    expect(await first.json()).toEqual({ player: { name } });
    expect((await (await call("/api/me", { cookie: sessionFrom(first) })).json<MeResponse>()).player).toEqual({ name });

    const again = await call("/api/link/redeem", { body: { token } });
    expect(again.status).toBe(401);
  });

  it("signs in a new device with the short code", async () => {
    const { cookie } = await signUp();
    const link = await newLink(cookie);
    expect(link.shortCode).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);

    const response = await call("/api/link/redeem", { body: { shortCode: link.shortCode.toLowerCase() } });

    expect(response.status).toBe(200);
  });

  it("refuses a link after 5 minutes", async () => {
    const { cookie, name } = await signUp();
    const link = await newLink(cookie);
    await env.DB.prepare(
      "UPDATE link_tokens SET expires_at = ? WHERE player_id = (SELECT id FROM players WHERE name = ?)",
    )
      .bind(Date.now() - 1, name)
      .run();

    const response = await call("/api/link/redeem", { body: { shortCode: link.shortCode } });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "wrong_link" });
  });

  it("needs a signed-in device to make a link", async () => {
    expect((await call("/api/link", { method: "POST" })).status).toBe(401);
  });
});

describe("request checks", () => {
  it("refuses a change from another site", async () => {
    const { secretCode } = await signUp();

    const response = await call("/api/sign-in", { body: { code: secretCode }, origin: "https://evil.example" });

    expect(response.status).toBe(403);
  });

  it("refuses a body that is too large or not an object", async () => {
    expect((await call("/api/sign-in", { body: { code: "x".repeat(3000) } })).status).toBe(400);
    expect((await call("/api/sign-in", { body: ["code"] })).status).toBe(400);
  });

  it("answers a signed-out request with 401", async () => {
    expect((await call("/api/devices")).status).toBe(401);
    expect((await call("/api/me/code", { cookie: "qq_session=made-up" })).status).toBe(401);
  });

  it("tells a signed-out device that nobody is signed in", async () => {
    expect(await (await call("/api/me")).json()).toEqual({ player: null, remember: false });
  });
});
