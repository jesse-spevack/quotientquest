import { type ClientMessage, parseServerMessage, type ServerMessage } from "../shared/messages";

export type ServerStatus =
  | { state: "connecting" }
  | { state: "connected"; playersOnline: number }
  | { state: "offline" };

export function connectToHub(onStatus: (status: ServerStatus) => void): () => void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/hub`);
  onStatus({ state: "connecting" });

  socket.addEventListener("open", () => {
    const hello: ClientMessage = { type: "hello" };
    socket.send(JSON.stringify(hello));
  });
  socket.addEventListener("message", (event) => {
    const message: ServerMessage | null = parseServerMessage(event.data);
    if (message) onStatus({ state: "connected", playersOnline: message.playersOnline });
  });
  socket.addEventListener("close", () => onStatus({ state: "offline" }));

  return () => socket.close(1000, "scene closed");
}
