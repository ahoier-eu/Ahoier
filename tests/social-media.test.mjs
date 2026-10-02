import assert from "node:assert/strict";
import { after, test } from "node:test";
import { MAX_SOCIAL_IMAGE_BYTES, prepareSocialImage } from "../src/lib/social-media.ts";

const originalBitmap = globalThis.createImageBitmap;
const originalDocument = globalThis.document;
after(() => { globalThis.createImageBitmap = originalBitmap; globalThis.document = originalDocument; });

test("rejects unsupported and oversized source files before decoding", async () => {
  await assert.rejects(prepareSocialImage(new File(["<svg/>",], "photo.svg", { type: "image/svg+xml" })), /JPEG.*PNG.*WebP/);
  const tooLarge = new File([new Uint8Array(12 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" });
  await assert.rejects(prepareSocialImage(tooLarge), /12 MB/);
});

test("converts a supported photo to a bounded WebP file", async () => {
  let closed = false;
  globalThis.createImageBitmap = async () => ({ width: 2400, height: 1200, close() { closed = true; } });
  globalThis.document = { createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ drawImage() {}, fillRect() {} }),
    toBlob: callback => callback(new Blob(["webp pixels"], { type: "image/webp" })),
  }) };
  const source = new File(["source pixels and metadata"], "original.jpg", { type: "image/jpeg" });
  const result = await prepareSocialImage(source);
  assert.equal(result.type, "image/webp");
  assert.ok(result.size <= MAX_SOCIAL_IMAGE_BYTES);
  assert.notEqual(await result.text(), await source.text());
  assert.equal(closed, true);
});
