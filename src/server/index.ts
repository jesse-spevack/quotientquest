export { HubWorld } from "./HubWorld";

const HUB_WORLD_NAME = "world-1";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") return health(env);

    if (url.pathname === "/api/hub") {
      const stub = env.HUB_WORLD.getByName(HUB_WORLD_NAME);
      return stub.fetch(request);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function health(env: Env): Promise<Response> {
  const game = await env.DB.prepare("SELECT value FROM app_meta WHERE key = ?").bind("game").first<string>("value");
  return Response.json({ ok: game !== null, game });
}
