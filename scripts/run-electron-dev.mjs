import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// In a Node context, `require('electron')` returns the path to electron binary.
// This script is used to launch Electron while ensuring we don't accidentally
// inherit `ELECTRON_RUN_AS_NODE` from the user environment.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const electronBinary = require("electron");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopDir = path.join(repoRoot, "apps", "desktop");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.ELECTRON_RENDERER_URL = env.ELECTRON_RENDERER_URL || "http://localhost:5173";

if (!existsSync(desktopDir)) {
  throw new Error(`Desktop dir not found: ${desktopDir}`);
}
if (!existsSync(electronBinary)) {
  throw new Error(`Electron binary not found: ${electronBinary}`);
}

const child = spawn(electronBinary, ["."], {
  cwd: desktopDir,
  env,
  stdio: "inherit"
});

child.on("error", (err) => {
  console.error("Failed to spawn electron:", err);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 1));
