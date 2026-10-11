import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalJson, sha256Hex, sha256HexBytes } from "../sha256";

describe("sha256Hex", () => {
  it.each(["", "abc", "The quick brown fox jumps over the lazy dog", "é世界🌍", "x".repeat(1000)])("matches node crypto for %j", (msg) => {
    expect(sha256Hex(msg)).toBe(createHash("sha256").update(msg, "utf8").digest("hex"));
  });

  it("hashes raw bytes of exact block boundaries", () => {
    for (const n of [55, 56, 63, 64, 65, 119, 120]) {
      const bytes = new Uint8Array(n).map((_, i) => i % 251);
      expect(sha256HexBytes(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });
});

describe("canonicalJson", () => {
  it("sorts keys recursively with compact separators", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });
  it("is independent of insertion order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});
