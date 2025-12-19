import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

const PAPER_API = "https://api.papermc.io/v2";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PaperMC API error (${res.status})`);
  return res.json();
}

export async function installPaperServer(serverDir: string, gameVersion: string) {
  await mkdir(serverDir, { recursive: true });
  const versionInfo = (await fetchJson(`${PAPER_API}/projects/paper/versions/${gameVersion}`)) as any;
  const builds: number[] = versionInfo?.builds ?? [];
  if (!builds.length) throw new Error(`Aucun build Paper pour ${gameVersion}`);
  const build = builds[builds.length - 1];
  const buildInfo = (await fetchJson(`${PAPER_API}/projects/paper/versions/${gameVersion}/builds/${build}`)) as any;
  const fileName: string = buildInfo?.downloads?.application?.name;
  const downloadUrl = `${PAPER_API}/projects/paper/versions/${gameVersion}/builds/${build}/downloads/${fileName}`;
  const dest = path.join(serverDir, "server.jar");
  const response = await fetch(downloadUrl);
  if (!response.ok || !response.body) throw new Error(`Téléchargement Paper échoué (${response.status})`);
  await pipeline(response.body, createWriteStream(dest));
  return { build, fileName };
}
