import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

type CurseforgeMod = {
  id: number;
  name: string;
  summary: string;
  links?: { websiteUrl?: string };
  latestFiles?: Array<CurseforgeFile>;
};

export type CurseforgeFile = {
  id: number;
  displayName: string;
  fileName: string;
  downloadUrl?: string;
  fileLength?: number;
};

const CF_BASE = "https://api.curseforge.com/v1";
const GAME_ID_MINECRAFT = 432;
const CLASS_ID_MODS = 6; // Minecraft Java Mods

function cfHeaders(apiKey: string) {
  return { "x-api-key": apiKey };
}

export async function searchCurseforgeMods(apiKey: string, query: string, pageSize = 20): Promise<CurseforgeMod[]> {
  const url = new URL(`${CF_BASE}/mods/search`);
  url.searchParams.set("gameId", String(GAME_ID_MINECRAFT));
  url.searchParams.set("classId", String(CLASS_ID_MODS));
  url.searchParams.set("searchFilter", query);
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("sortField", "2"); // popularity
  const res = await fetch(url, { headers: cfHeaders(apiKey) });
  if (!res.ok) throw new Error(`CurseForge search failed (${res.status})`);
  const json: any = await res.json();
  return json?.data ?? [];
}

export async function getCurseforgeFile(
  apiKey: string,
  modId: number,
  fileId: number
): Promise<CurseforgeFile | null> {
  const res = await fetch(`${CF_BASE}/mods/${modId}/files/${fileId}`, { headers: cfHeaders(apiKey) });
  if (!res.ok) throw new Error(`CurseForge file lookup failed (${res.status})`);
  const json: any = await res.json();
  return json?.data ?? null;
}

export async function downloadCurseforgeFile(
  apiKey: string,
  modId: number,
  fileId: number,
  destinationDir: string,
  fileName?: string,
  downloadUrl?: string
): Promise<string> {
  const fileMeta = await getCurseforgeFile(apiKey, modId, fileId);
  const url = downloadUrl ?? fileMeta?.downloadUrl;
  if (!url) throw new Error("Aucune URL de téléchargement CurseForge trouvée");
  const name = fileName ?? fileMeta?.fileName ?? `${modId}-${fileId}.jar`;
  await mkdir(destinationDir, { recursive: true });
  const dest = path.join(destinationDir, name);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Téléchargement échoué (${response.status})`);
  await pipeline(response.body, createWriteStream(dest));
  return dest;
}
