import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timingSafeEqual as nodeTimingSafeEqual, webcrypto } from "node:crypto";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../supabase/functions/ahoier-media-cleanup/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const token = "a".repeat(64);

function loadHandler(configuredToken) {
  const loadedModule = { exports: {} };
  runInNewContext(compiled, {
    module: loadedModule,
    exports: loadedModule.exports,
    require(specifier) {
      if (specifier === "npm:@supabase/server@1") return { withSupabase: (_options, handler) => handler };
      if (specifier === "jsr:@std/crypto@1.1.0/timing-safe-equal") {
        return { timingSafeEqual: (a, b) => nodeTimingSafeEqual(Buffer.from(a), Buffer.from(b)) };
      }
      throw new Error(`Unexpected import: ${specifier}`);
    },
    Deno: { env: { get: () => configuredToken } },
    crypto: webcrypto,
    TextEncoder,
    Response,
    console: { error() {} },
  });
  return loadedModule.exports.default.fetch;
}

function createAdmin(paths, failFirstBatch = false) {
  const calls = [];
  const admin = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: name === "ahoier_cleanup_candidates" ? paths.map(path => ({ path })) : null, error: null };
    },
    storage: { from: bucket => {
      assert.equal(bucket, "ahoier-media");
      return { remove: async batch => {
        calls.push({ remove: [...batch] });
        return { data: [], error: failFirstBatch && batch.length === 20 ? new Error("storage unavailable") : null };
      } };
    } },
  };
  return { admin, calls };
}

function request(value, method = "POST") {
  return new Request("https://example.test/functions/v1/ahoier-media-cleanup", {
    method,
    headers: value === undefined ? {} : { "x-ahoier-cleanup-token": value },
  });
}

test("external cleanup rejects missing configuration and wrong tokens before admin calls", async () => {
  const { admin, calls } = createAdmin(["avatar/example.webp"]);
  const missing = await loadHandler(undefined)(request(token), { authMode: "none", supabaseAdmin: admin });
  assert.equal(missing.status, 503);
  const rejected = await loadHandler(token)(request("wrong"), { authMode: "none", supabaseAdmin: admin });
  assert.equal(rejected.status, 401);
  const wrongMethod = await loadHandler(token)(request(token, "GET"), { authMode: "none", supabaseAdmin: admin });
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(calls, []);
});

test("external cleanup batches deletions and acknowledges only successful paths", async () => {
  const paths = Array.from({ length: 21 }, (_, index) => `avatar/${index}.webp`);
  const { admin, calls } = createAdmin(paths, true);
  const response = await loadHandler(token)(request(token), { authMode: "none", supabaseAdmin: admin });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { removed: 1, failed: 20 });
  assert.deepEqual(calls.filter(call => call.remove).map(call => call.remove.length), [20, 1]);
  assert.deepEqual(Array.from(calls.find(call => call.name === "ahoier_cleanup_ack")?.params?.p_paths ?? []), [paths[20]]);
});

test("external cleanup accepts the configured token", async () => {
  const { admin, calls } = createAdmin(["avatar/example.webp"]);
  const response = await loadHandler(token)(request(token), { authMode: "none", supabaseAdmin: admin });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { removed: 1, failed: 0 });
  assert.equal(calls.find(call => call.name === "ahoier_cleanup_ack")?.params?.p_paths?.[0], "avatar/example.webp");
});

test("Supabase Cron secret mode remains supported", async () => {
  const { admin } = createAdmin([]);
  const response = await loadHandler(undefined)(request(undefined), { authMode: "secret", supabaseAdmin: admin });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { removed: 0, failed: 0 });
});
