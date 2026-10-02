// Scheduled maintenance for private community photos. Only Supabase secret-key
// callers are admitted by withSupabase; the key never reaches the browser.
import { withSupabase } from "npm:@supabase/server@1";

const cleanupFunction = {
  fetch: withSupabase({ auth: "secret" }, async (_request, context) => {
    const admin = context.supabaseAdmin;
    const { data: candidates, error: listError } = await admin.rpc("ahoier_cleanup_candidates");
    if (listError) return Response.json({ error: "Could not load cleanup candidates" }, { status: 500 });

    const removed: string[] = [];
    const failed: string[] = [];
    for (const candidate of candidates ?? []) {
      const path = candidate.path as string;
      const { error } = await admin.storage.from("ahoier-media").remove([path]);
      if (error) failed.push(path);
      else removed.push(path);
    }
    if (removed.length) {
      const { error } = await admin.rpc("ahoier_cleanup_ack", { p_paths: removed });
      if (error) return Response.json({ error: "Could not acknowledge removed files", removed: removed.length }, { status: 500 });
    }
    return Response.json({ removed: removed.length, failed: failed.length }, { status: failed.length ? 503 : 200 });
  }),
};

export default cleanupFunction;
