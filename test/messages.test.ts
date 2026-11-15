import { expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "../src/shared/messages";

it("reads a welcome message", () => {
  expect(parseServerMessage('{"type":"welcome","playersOnline":3}')).toEqual({ type: "welcome", playersOnline: 3 });
});

it("rejects broken or unknown messages", () => {
  expect(parseServerMessage("{")).toBeNull();
  expect(parseServerMessage('{"type":"welcome"}')).toBeNull();
  expect(parseClientMessage('{"type":"attack"}')).toBeNull();
  expect(parseClientMessage(new ArrayBuffer(2))).toBeNull();
});
