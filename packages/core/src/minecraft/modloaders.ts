import type { AppPaths } from "../paths/appPaths.js";
import { getMinecraftRoot } from "./vanilla.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  installFabric as xmclInstallFabric,
  installQuiltVersion,
  installForge,
  installNeoForged
} from "@xmcl/installer";
import type { Version } from "@xmcl/core";

/**
 * Installe Fabric via metadata (pas besoin de Java).
 * @returns l’id de version créé (dossier dans `versions/`)
 */
export async function installFabric(
  paths: AppPaths,
  instanceDir: string,
  minecraftVersion: string,
  loaderVersion: string
): Promise<string> {
  const mcRoot = getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });
  return xmclInstallFabric({
    minecraftVersion,
    version: loaderVersion,
    minecraft: mcRoot,
    side: "client"
  });
}

export async function installQuilt(
  paths: AppPaths,
  instanceDir: string,
  minecraftVersion: string,
  loaderVersion: string
): Promise<string> {
  const mcRoot = getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });
  return installQuiltVersion({
    minecraftVersion,
    version: loaderVersion,
    minecraft: mcRoot,
    side: "client"
  });
}

export async function installLegacyFabric(
  paths: AppPaths,
  instanceDir: string,
  minecraftVersion: string,
  loaderVersion: string
): Promise<string> {
  const mcRoot = getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });

  // LegacyFabric expose un profile json compatible format Mojang.
  const url = `https://meta.legacyfabric.net/v2/versions/loader/${minecraftVersion}/${loaderVersion}/profile/json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`LegacyFabric profile HTTP ${res.status}`);
  const version = (await res.json()) as Version;

  const versionId = version.id || `fabric-loader-${loaderVersion}-${minecraftVersion}`;
  const versionDir = path.join(mcRoot, "versions", versionId);
  await mkdir(versionDir, { recursive: true });
  await writeFile(path.join(versionDir, `${versionId}.json`), JSON.stringify(version, null, 2), "utf-8");
  return versionId;
}

/**
 * Installe Forge (peut nécessiter Java, utilisé pour le post-process).
 * @returns l’id de version créé
 */
export async function installForgeVersion(
  paths: AppPaths,
  instanceDir: string,
  javaPath: string,
  minecraftVersion: string,
  forgeVersion: string
): Promise<string> {
  const mcRoot = getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });
  return installForge(
    { mcversion: minecraftVersion, version: forgeVersion },
    mcRoot,
    { side: "client", java: javaPath }
  );
}

export async function installNeoForgeVersion(
  paths: AppPaths,
  instanceDir: string,
  javaPath: string,
  neoForgeVersion: string
): Promise<string> {
  const mcRoot = getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });
  // NeoForge installeur (xmcl) : gère le téléchargement depuis maven + post-process.
  return installNeoForged("neoforge", neoForgeVersion, mcRoot, { side: "client", java: javaPath });
}
