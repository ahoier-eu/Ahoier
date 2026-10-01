import { createHash, randomBytes } from "node:crypto";

const code = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(code, "utf8").digest("hex");

process.stdout.write(`Invite code (give privately to the guest): ${code}\n`);
process.stdout.write(`SHA-256 hash (store in Supabase):       ${hash}\n`);
