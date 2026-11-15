import { handleAccountRoute } from "./accounts/routes";
import { findSession } from "./accounts/sessions";
import { fail } from "./http";

export { HubWorld } from "./HubWorld";

const HUB_WORLD_NAME = "world-1";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") return health(env);
    if (url.pathname === "/api/hub") return joinHub(request, env);

    const disconnect = (deviceId: string) => env.HUB_WORLD.getByName(HUB_WORLD_NAME).disconnectDevice(deviceId);
    const response = await handleAccountRoute(request, env, disconnect);
    return response ?? fail("not_found", 404);
  },
} satisfies ExportedHandler<Env>;

async function joinHub(request: Request, env: Env): Promise<Response> {
  const session = await findSession(env, request);
  if (!session) return fail("signed_out", 401);

  const headers = new Headers(request.headers);
  headers.set("X-Device-Id", session.deviceId);
  headers.set("X-Player-Name", session.player.name);
  return env.HUB_WORLD.getByName(HUB_WORLD_NAME).fetch(new Request(request, { headers }));
}

async function health(env: Env): Promise<Response> {
  const game = await env.DB.prepare("SELECT value FROM app_meta WHERE key = ?").bind("game").first<string>("value");
  return Response.json({ ok: game !== null, game });
}
