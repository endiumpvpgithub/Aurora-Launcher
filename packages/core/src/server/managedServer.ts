import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export type ManagedServer = {
  id: string;
  name: string;
  gameVersion: string;
  serverDir: string;
  java: {
    javaPath?: string;
    minRamMiB: number;
    maxRamMiB: number;
    jvmArgs: string[];
  };
  port: number;
  nogui: boolean;
};

export function getServerJarPath(serverDir: string) {
  return path.join(serverDir, "server.jar");
}

export function getEulaPath(serverDir: string) {
  return path.join(serverDir, "eula.txt");
}

export async function setEulaAccepted(serverDir: string, accepted: boolean) {
  await mkdir(serverDir, { recursive: true });
  const file = getEulaPath(serverDir);
  const content = `# By changing the setting below to TRUE you are indicating your agreement to our EULA.\n# https://aka.ms/MinecraftEULA\n${`eula=${accepted ? "true" : "false"}`}\n`;
  await writeFile(file, content, "utf-8");
}

export async function readEulaAccepted(serverDir: string): Promise<boolean> {
  try {
    const raw = await readFile(getEulaPath(serverDir), "utf-8");
    return /eula\s*=\s*true/i.test(raw);
  } catch {
    return false;
  }
}

/**
 * Minimal read/update of server.properties. We keep it simple (key=value).
 * Comments and ordering may be lost when writing back.
 */
export async function readServerProperties(serverDir: string): Promise<Record<string, string>> {
  const file = path.join(serverDir, "server.properties");
  try {
    const raw = await readFile(file, "utf-8");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/g)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeServerProperties(serverDir: string, props: Record<string, string>) {
  await mkdir(serverDir, { recursive: true });
  const file = path.join(serverDir, "server.properties");
  const lines = Object.entries(props).map(([k, v]) => `${k}=${v}`);
  await writeFile(file, lines.join("\n") + "\n", "utf-8");
}

