import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { SIGNED_OUT_CLOSE_CODE } from "../src/server/HubWorld";
import { parseServerMessage } from "../src/shared/messages";
import { call, signUp } from "./accountApi";

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("No message from the hub")), 5_000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(event.data);
    });
  });
}

function closed(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("The hub did not close the socket")), 5_000);
    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve(event.code);
    });
  });
}

async function openHubSocket(cookie: string): Promise<WebSocket> {
  const response = await exports.default.fetch("https://example.com/api/hub", {
    headers: { Upgrade: "websocket", Cookie: cookie },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket");
  socket.accept();
  return socket;
}

it("welcomes a signed-in player by name", async () => {
  const { cookie, name } = await signUp();
  const socket = await openHubSocket(cookie);
  const reply = nextMessage(socket);

  socket.send(JSON.stringify({ type: "hello" }));

  expect(parseServerMessage(await reply)).toMatchObject({ type: "welcome", playerName: name });
  socket.close(1000, "done");
});

it("ignores a message it does not know", async () => {
  const { cookie } = await signUp();
  const socket = await openHubSocket(cookie);
  const reply = nextMessage(socket);

  socket.send("not json");
  socket.send(JSON.stringify({ type: "hello" }));

  expect(parseServerMessage(await reply)).toMatchObject({ type: "welcome" });
  socket.close(1000, "done");
});

it("refuses a player who is not signed in", async () => {
  const response = await exports.default.fetch("https://example.com/api/hub", { headers: { Upgrade: "websocket" } });

  expect(response.status).toBe(401);
});

it("closes the hub socket of a device that signs out", async () => {
  const { cookie } = await signUp();
  const socket = await openHubSocket(cookie);
  const closeCode = closed(socket);

  await call("/api/sign-out", { method: "POST", cookie });

  expect(await closeCode).toBe(SIGNED_OUT_CLOSE_CODE);
});

it("asks for a WebSocket upgrade on a plain request", async () => {
  const { cookie } = await signUp();
  const response = await exports.default.fetch("https://example.com/api/hub", { headers: { Cookie: cookie } });

  expect(response.status).toBe(426);
});
