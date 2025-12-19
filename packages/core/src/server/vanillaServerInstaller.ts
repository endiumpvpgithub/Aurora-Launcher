import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fetchVersionManifest } from "../minecraft/vanilla.js";
import { getServerJarPath, setEulaAccepted, writeServerProperties } from "./managedServer.js";

type VersionDetail = {
  downloads?: { server?: { url: string; sha1?: string } };
};

/**
 * Télécharge le server.jar officiel (vanilla) pour une version donnée.
 * - Utilise la version_manifest Mojang
 * - Respecte les licences : téléchargement depuis endpoints officiels uniquement.
 */
export async function installVanillaServer(serverDir: string, gameVersion: string): Promise<void> {
  await mkdir(serverDir, { recursive: true });

  const manifest = await fetchVersionManifest();
  const meta = manifest.versions.find((v) => v.id === gameVersion);
  if (!meta) throw new Error(`Version Minecraft introuvable: ${gameVersion}`);

  const detailRes = await fetch(meta.url, { headers: { accept: "application/json" } });
  if (!detailRes.ok) throw new Error(`Version detail HTTP ${detailRes.status}`);
  const detail = (await detailRes.json()) as VersionDetail;
  const url = detail.downloads?.server?.url;
  if (!url) throw new Error(`Pas de download server pour ${gameVersion} (snapshot/old?)`);

  const jarPath = getServerJarPath(serverDir);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Server.jar download HTTP ${res.status}`);
  await pipeline(res.body as any, createWriteStream(jarPath));

  // EULA par défaut = false (l’utilisateur doit accepter explicitement dans l’UI)
  await setEulaAccepted(serverDir, false);

  // Default server.properties minimal
  await writeServerProperties(serverDir, {
    "server-port": "25565",
    "enable-command-block": "false",
    "online-mode": "true",
    "motd": "Aurora Managed Server"
  });
}

