import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { parseServerMessage } from "../src/shared/messages";

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("No message from the hub")), 5_000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(event.data);
    });
  });
}

async function openHubSocket(): Promise<WebSocket> {
  const response = await exports.default.fetch("https://example.com/api/hub", { headers: { Upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket");
  socket.accept();
  return socket;
}

it("welcomes a player who says hello", async () => {
  const socket = await openHubSocket();
  const reply = nextMessage(socket);

  socket.send(JSON.stringify({ type: "hello" }));

  expect(parseServerMessage(await reply)).toEqual({ type: "welcome", playersOnline: 1 });
  socket.close(1000, "done");
});

it("ignores a message it does not know", async () => {
  const socket = await openHubSocket();
  const reply = nextMessage(socket);

  socket.send("not json");
  socket.send(JSON.stringify({ type: "hello" }));

  expect(parseServerMessage(await reply)).toMatchObject({ type: "welcome" });
  socket.close(1000, "done");
});

it("asks for a WebSocket upgrade on a plain request", async () => {
  const response = await exports.default.fetch("https://example.com/api/hub");

  expect(response.status).toBe(426);
});
