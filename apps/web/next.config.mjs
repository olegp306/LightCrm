import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rootEnvPath = resolve(repoRoot, ".env");
try {
  for (const line of readFileSync(rootEnvPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
} catch {
  // The API layer will report a clear DATABASE_URL error if no env is available.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lightcrm/core", "@lightcrm/db", "@lightcrm/storage", "@lightcrm/ui"]
};

export default nextConfig;
