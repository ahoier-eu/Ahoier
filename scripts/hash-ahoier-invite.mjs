import { createHash } from "node:crypto";
import { stdin, stdout, stderr } from "node:process";
import { createInterface } from "node:readline/promises";

const prompt = createInterface({ input: stdin, output: stdout });

try {
  const code = (await prompt.question("Invite code to check: ")).trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(code)) {
    stderr.write("Expected a 32-character hexadecimal invite code.\n");
    process.exitCode = 1;
  } else {
    const hash = createHash("sha256").update(code, "utf8").digest("hex");
    stdout.write(`SHA-256 hash: ${hash}\n`);
  }
} finally {
  prompt.close();
}
