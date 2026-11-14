import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, type ServerMessage } from "../shared/messages";

export class HubWorld extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) return;

    const reply: ServerMessage = { type: "welcome", playersOnline: this.ctx.getWebSockets().length };
    socket.send(JSON.stringify(reply));
  }
}
