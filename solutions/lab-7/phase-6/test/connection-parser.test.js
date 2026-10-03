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
