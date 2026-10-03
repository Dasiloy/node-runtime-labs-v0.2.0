import test from "node:test";
import assert from "node:assert/strict";
import { buildEventPayload, encodeFrame } from "../client/encode.js";
import { createParserState, pushChunk } from "../src/connection-parser.js";

test("pushChunk carries one-byte input until the full frame exists", () => {
  const frame = encodeFrame({
    requestId: 123,
    payload: buildEventPayload({
      name: "tiny.chunks",
      timestamp: "2026-01-01T00:00:00.000Z"
    })
  });
  const state = createParserState();
  let result = { frames: [] };

  for (let index = 0; index < frame.length; index += 1) {
    result = pushChunk(state, frame.subarray(index, index + 1));
    if (index < frame.length - 1) {
      assert.equal(result.frames.length, 0);
      assert.equal(state.carry.length, index + 1);
    }
  }

  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].requestId, "123");
  assert.equal(result.frames[0].payload.name, "tiny.chunks");
  assert.equal(state.carry.length, 0);
  assert.equal(state.framesRead, 1);
});

test("pushChunk decodes two complete frames from one buffer", () => {
  const first = encodeFrame({
    requestId: 1,
    payload: buildEventPayload({ name: "one", timestamp: "2026-01-01T00:00:00.000Z" })
  });
  const second = encodeFrame({
    requestId: 2,
    payload: buildEventPayload({ name: "two", timestamp: "2026-01-01T00:00:00.000Z" })
  });
  const state = createParserState();
  const result = pushChunk(state, Buffer.concat([first, second]));

  assert.equal(result.frames.length, 2);
  assert.equal(result.frames[0].payload.name, "one");
  assert.equal(result.frames[1].payload.name, "two");
  assert.equal(result.remainingBytes, 0);
  assert.equal(state.framesRead, 2);
});

test("pushChunk preserves one-and-a-half frame tails", () => {
  const first = encodeFrame({
    requestId: 10,
    payload: buildEventPayload({ name: "full", timestamp: "2026-01-01T00:00:00.000Z" })
  });
  const second = encodeFrame({
    requestId: 11,
    payload: buildEventPayload({ name: "tail", timestamp: "2026-01-01T00:00:00.000Z" })
  });
  const splitAt = 31;
  const state = createParserState();
  const firstPush = pushChunk(state, Buffer.concat([first, second.subarray(0, splitAt)]));

  assert.equal(firstPush.frames.length, 1);
  assert.equal(firstPush.frames[0].payload.name, "full");
  assert.equal(firstPush.remainingBytes, splitAt);

  const secondPush = pushChunk(state, second.subarray(splitAt));

  assert.equal(secondPush.frames.length, 1);
  assert.equal(secondPush.frames[0].payload.name, "tail");
  assert.equal(secondPush.remainingBytes, 0);
});
