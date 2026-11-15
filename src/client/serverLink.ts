import { type ClientMessage, parseServerMessage, type ServerMessage } from "../shared/messages";

export const SIGNED_OUT_CLOSE_CODE = 4001;

export type ServerStatus =
  | { state: "connecting" }
  | { state: "connected"; playerName: string; playersOnline: number }
  | { state: "signed-out" }
  | { state: "offline" };

export function connectToHub(onStatus: (status: ServerStatus) => void): () => void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/hub`);
  let closedHere = false;
  onStatus({ state: "connecting" });

  socket.addEventListener("open", () => {
    const hello: ClientMessage = { type: "hello" };
    socket.send(JSON.stringify(hello));
  });
  socket.addEventListener("message", (event) => {
    const message: ServerMessage | null = parseServerMessage(event.data);
    if (message) onStatus({ state: "connected", playerName: message.playerName, playersOnline: message.playersOnline });
  });
  socket.addEventListener("close", (event) => {
    if (closedHere) return;
    onStatus({ state: event.code === SIGNED_OUT_CLOSE_CODE ? "signed-out" : "offline" });
  });

  return () => {
    closedHere = true;
    socket.close(1000, "scene closed");
  };
}
