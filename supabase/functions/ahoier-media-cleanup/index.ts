// Scheduled maintenance for private community photos. Supabase Cron may use a
// project secret key; external schedulers use a separate, function-only token.
import { withSupabase } from "npm:@supabase/server@1";
import { timingSafeEqual } from "jsr:@std/crypto@1.1.0/timing-safe-equal";

declare const Deno: { env: { get(name: string): string | undefined } };

const encoder = new TextEncoder();

const cleanupFunction = {
  fetch: withSupabase({ auth: ["secret", "none"] }, async (request, context) => {
    if (context.authMode !== "secret") {
      const expected = Deno.env.get("AHOIER_CLEANUP_CRON_SECRET");
      if (!expected || !/^[0-9a-f]{64}$/.test(expected)) {
        console.error("Media cleanup scheduler token is not configured");
        return Response.json({ error: "Cleanup is unavailable" }, { status: 503 });
      }

      const provided = request.headers.get("x-ahoier-cleanup-token") ?? "";
      const [actualDigest, expectedDigest] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(provided)),
        crypto.subtle.digest("SHA-256", encoder.encode(expected)),
      ]);
      if (!timingSafeEqual(actualDigest, expectedDigest)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const admin = context.supabaseAdmin;
    const { data: candidates, error: listError } = await admin.rpc("ahoier_cleanup_candidates");
    if (listError) return Response.json({ error: "Could not load cleanup candidates" }, { status: 500 });

    const removed: string[] = [];
    const failed: string[] = [];
    const paths = (candidates ?? []).map((candidate: { path: string }) => candidate.path);
    // Storage accepts up to 1000 paths per call. Small batches keep one bad
    // request from blocking the other paths and finish within scheduler limits.
    for (let offset = 0; offset < paths.length; offset += 20) {
      const batch = paths.slice(offset, offset + 20);
      try {
        const { error } = await admin.storage.from("ahoier-media").remove(batch);
        if (error) failed.push(...batch);
        else removed.push(...batch);
      } catch {
        failed.push(...batch);
      }
    }
    if (removed.length) {
      const { error } = await admin.rpc("ahoier_cleanup_ack", { p_paths: removed });
      if (error) return Response.json({ error: "Could not acknowledge removed files", removed: removed.length }, { status: 500 });
    }
    return Response.json({ removed: removed.length, failed: failed.length }, { status: failed.length ? 503 : 200 });
  }),
};

export default cleanupFunction;
