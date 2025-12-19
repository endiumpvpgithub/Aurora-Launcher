import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { LibraryIssue, MinecraftIssueReport } from "@xmcl/core";
import { diagnose, Version } from "@xmcl/core";
import { getVersionList, install, installDependencies, installResolvedLibraries, installVersion } from "@xmcl/installer";
import { getMinecraftRoot } from "./vanilla.js";

async function pathExists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isVersionInstalled(minecraftRoot: string, versionId: string): Promise<boolean> {
  const versionJson = path.join(minecraftRoot, "versions", versionId, `${versionId}.json`);
  return pathExists(versionJson);
}

export async function ensureVanillaInstalled(
  instanceDir: string,
  gameVersion: string
): Promise<void> {
  const mcRoot = getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });

  if (await isVersionInstalled(mcRoot, gameVersion)) return;

  const list = await getVersionList();
  const meta = list.versions.find((v) => v.id === gameVersion);
  if (!meta) throw new Error(`Version Minecraft introuvable: ${gameVersion}`);

  // Installe json + jar + assets + libraries.
  try {
    await install(meta, mcRoot, { side: "client" });
  } catch (err) {
    if (!isMissingLibrariesError(err)) throw err;
    await repairMissingLibraries(mcRoot, gameVersion, meta, err);
  }
}

function isMissingLibrariesError(err: unknown): boolean {
  const message = String(err ?? "");
  return /Missing\s+\d+\s+libraries/i.test(message) || /Missing .* libraries/i.test(message);
}

async function repairMissingLibraries(
  mcRoot: string,
  gameVersion: string,
  meta: { id: string; url: string },
  originalError: unknown
) {
  // Assure le json/jar pour diagnostiquer correctement.
  try {
    await Version.parse(mcRoot, gameVersion);
  } catch {
    await installVersion(meta, mcRoot, { side: "client" });
  }

  let report: MinecraftIssueReport | null = null;
  try {
    report = await diagnose(gameVersion, mcRoot);
  } catch {
    report = null;
  }

  const libraryIssues = (report?.issues ?? []).filter((i) => i.role === "library") as LibraryIssue[];
  if (libraryIssues.length) {
    await installResolvedLibraries(
      libraryIssues.map((i) => i.library),
      mcRoot,
      { librariesDownloadConcurrency: 6 }
    );
  }

  const needsAssets = (report?.issues ?? []).some((i) => i.role === "asset" || i.role === "assetIndex");
  const needsJar = (report?.issues ?? []).some((i) => i.role === "minecraftJar" || i.role === "versionJson");

  if (needsJar) {
    await installVersion(meta, mcRoot, { side: "client" });
  }

  if (needsAssets || libraryIssues.length === 0) {
    try {
      const resolved = await Version.parse(mcRoot, gameVersion);
      await installDependencies(resolved, { side: "client" });
    } catch {
      // Si on ne peut pas parser la version, on remonte l'erreur d'origine.
      throw originalError;
    }
  }
}
