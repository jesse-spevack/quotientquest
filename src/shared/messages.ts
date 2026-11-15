export type ClientMessage = { type: "hello" };

export type ServerMessage = { type: "welcome"; playersOnline: number };

export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  try {
    const message = JSON.parse(data);
    if (message?.type === "welcome" && typeof message.playersOnline === "number") return message;
  } catch {
    return null;
  }
  return null;
}

export function parseClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== "string") return null;
  try {
    const message = JSON.parse(data);
    if (message?.type === "hello") return message;
  } catch {
    return null;
  }
  return null;
}
