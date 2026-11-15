import {
  type DeviceLinkResponse,
  type DevicesResponse,
  LINK_PATH,
  type MeResponse,
  type NamesResponse,
  type SecretCodeResponse,
  type SignInResponse,
  type SignUpResponse,
} from "../../shared/account";
import { clientKey, fail, isCrossSite, json, readJsonObject } from "../http";
import { deviceName } from "./deviceName";
import { createDeviceLink, useDeviceLink } from "./linkTokens";
import { isPlayerName, offerNames } from "./names";
import { createPlayer, findPlayerByCode, type Player, readSecretCode, replaceSecretCode } from "./players";
import {
  clearedSessionCookie,
  endPlayerSession,
  endSession,
  findSession,
  listDevices,
  readCookie,
  rememberDevice,
  SESSION_COOKIE,
  type Session,
  sessionCookie,
  startSession,
} from "./sessions";

export type DisconnectDevice = (deviceId: string) => Promise<void>;

type Route = (request: Request, env: Env, disconnect: DisconnectDevice) => Promise<Response>;
type SignedInRoute = (request: Request, env: Env, session: Session, disconnect: DisconnectDevice) => Promise<Response>;

const routes: Record<string, Route> = {
  "GET /api/names": async () => json({ names: offerNames() } satisfies NamesResponse),
  "POST /api/players": signUp,
  "POST /api/sign-in": signIn,
  "POST /api/link/redeem": redeemLink,
  "GET /api/me": async (request, env) => {
    const session = await findSession(env, request);
    if (!session) return json({ player: null, remember: false } satisfies MeResponse);
    return json({ player: { name: session.player.name }, remember: session.remember } satisfies MeResponse);
  },
  "POST /api/session/remember": signedIn(setRemember),
  "GET /api/me/code": signedIn(async (_request, env, session) =>
    json({ secretCode: await readSecretCode(env, session.player.id) } satisfies SecretCodeResponse),
  ),
  "POST /api/me/code": signedIn(async (_request, env, session) =>
    json({ secretCode: await replaceSecretCode(env, session.player.id) } satisfies SecretCodeResponse),
  ),
  "GET /api/devices": signedIn(devices),
  "POST /api/sign-out": signedIn(async (_request, env, session, disconnect) => {
    await endSession(env, session.deviceId);
    await disconnect(session.deviceId);
    return json({ ok: true }, { cookie: clearedSessionCookie() });
  }),
  "POST /api/link": signedIn(async (request, env, session) => {
    const link = await createDeviceLink(env, session.player.id);
    const url = `${new URL(request.url).origin}${LINK_PATH}#${link.token}`;
    return json({ url, shortCode: link.shortCode, expiresAt: link.expiresAt } satisfies DeviceLinkResponse);
  }),
};

const DEVICE_PATH = /^\/api\/devices\/([0-9a-f-]{36})$/;

export async function handleAccountRoute(
  request: Request,
  env: Env,
  disconnect: DisconnectDevice,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "GET" && isCrossSite(request)) return fail("forbidden", 403);

  const route = routes[`${request.method} ${url.pathname}`];
  if (route) return route(request, env, disconnect);

  const deviceId = DEVICE_PATH.exec(url.pathname)?.[1];
  if (deviceId && request.method === "DELETE") {
    const route = signedIn((_request, env, session) => signOutDevice(env, session, deviceId, disconnect));
    return route(request, env, disconnect);
  }
  return null;
}

async function signUp(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body || typeof body.name !== "string" || !isPlayerName(body.name)) return fail("bad_request", 400);

  const { success } = await env.SIGN_UP_LIMITER.limit({ key: clientKey(request) });
  if (!success) return fail("too_many_tries", 429);

  const created = await createPlayer(env, body.name);
  if (!created) return fail("name_taken", 409);

  const cookie = await signInCookie(env, request, body, created.player);
  return json({ player: { name: created.player.name }, secretCode: created.secretCode } satisfies SignUpResponse, {
    status: 201,
    cookie,
  });
}

async function signIn(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body || typeof body.code !== "string") return fail("bad_request", 400);

  const { success } = await env.SIGN_IN_LIMITER.limit({ key: clientKey(request) });
  if (!success) return fail("too_many_tries", 429);

  const player = await findPlayerByCode(env, body.code);
  if (!player) return fail("wrong_code", 401);

  return json({ player: { name: player.name } } satisfies SignInResponse, {
    cookie: await signInCookie(env, request, body, player),
  });
}

async function redeemLink(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const token = typeof body?.token === "string" ? body.token : undefined;
  const shortCode = typeof body?.shortCode === "string" ? body.shortCode : undefined;
  if (!body || (!token && !shortCode)) return fail("bad_request", 400);

  const { success } = await env.SIGN_IN_LIMITER.limit({ key: clientKey(request) });
  if (!success) return fail("too_many_tries", 429);

  const playerId = await useDeviceLink(env, { token, shortCode });
  const player = playerId
    ? await env.DB.prepare("SELECT id, name FROM players WHERE id = ?").bind(playerId).first<Player>()
    : null;
  if (!player) return fail("wrong_link", 401);

  return json({ player: { name: player.name } } satisfies SignInResponse, {
    cookie: await signInCookie(env, request, body, player),
  });
}

async function setRemember(request: Request, env: Env, session: Session): Promise<Response> {
  const body = await readJsonObject(request);
  const token = readCookie(request, SESSION_COOKIE);
  if (!body || typeof body.remember !== "boolean" || !token) return fail("bad_request", 400);

  await rememberDevice(env, session.deviceId, body.remember);
  return json({ ok: true }, { cookie: sessionCookie(token, body.remember) });
}

async function devices(_request: Request, env: Env, session: Session): Promise<Response> {
  const list = await listDevices(env, session.player.id);
  return json({
    devices: list.map((device) => ({ ...device, current: device.id === session.deviceId })),
  } satisfies DevicesResponse);
}

async function signOutDevice(
  env: Env,
  session: Session,
  deviceId: string,
  disconnect: DisconnectDevice,
): Promise<Response> {
  const ended = await endPlayerSession(env, session.player.id, deviceId);
  if (!ended) return fail("not_found", 404);

  await disconnect(deviceId);
  const here = deviceId === session.deviceId;
  return json({ ok: true }, { cookie: here ? clearedSessionCookie() : undefined });
}

async function signInCookie(
  env: Env,
  request: Request,
  body: Record<string, unknown>,
  player: Player,
): Promise<string> {
  const name = deviceName(request.headers.get("User-Agent") ?? "", body.touchMac === true);
  const token = await startSession(env, player.id, name);
  return sessionCookie(token, false);
}

function signedIn(route: SignedInRoute): Route {
  return async (request, env, disconnect) => {
    const session = await findSession(env, request);
    if (!session) return fail("signed_out", 401, clearedSessionCookie());
    return route(request, env, session, disconnect);
  };
}
