import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { AppPaths } from "../paths/appPaths.js";

/**
 * Résout le dossier “.minecraft” d’une instance.
 * On garde une structure proche du launcher officiel pour compatibilité.
 */
export function getMinecraftRoot(instanceDir: string): string {
  return path.join(instanceDir, ".minecraft");
}

export type VersionManifest = {
  latest: { release: string; snapshot: string };
  versions: Array<{
    id: string;
    type: string;
    url: string;
    time: string;
    releaseTime: string;
  }>;
};

export async function fetchVersionManifest(): Promise<VersionManifest> {
  const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json", {
    headers: { accept: "application/json" }
  });
  if (!res.ok) throw new Error(`Version manifest HTTP ${res.status}`);
  return (await res.json()) as VersionManifest;
}

export async function ensureInstanceDirs(paths: AppPaths, instanceDir: string) {
  await mkdir(instanceDir, { recursive: true });
  await mkdir(getMinecraftRoot(instanceDir), { recursive: true });
  await mkdir(path.join(paths.cacheDir, "downloads"), { recursive: true });
  await mkdir(path.join(paths.cacheDir, "installers"), { recursive: true });
}

