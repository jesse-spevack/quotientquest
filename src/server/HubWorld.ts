import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, type ServerMessage } from "../shared/messages";

type SocketInfo = { playerName: string };

export const SIGNED_OUT_CLOSE_CODE = 4001;

export class HubWorld extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const deviceId = request.headers.get("X-Device-Id");
    const playerName = request.headers.get("X-Player-Name");
    if (!deviceId || !playerName) return new Response("Missing player", { status: 401 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [deviceId]);
    server.serializeAttachment({ playerName } satisfies SocketInfo);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) return;

    const { playerName } = socket.deserializeAttachment() as SocketInfo;
    const reply: ServerMessage = { type: "welcome", playerName, playersOnline: this.ctx.getWebSockets().length };
    socket.send(JSON.stringify(reply));
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets(deviceId)) socket.close(SIGNED_OUT_CLOSE_CODE, "signed out");
  }
}
