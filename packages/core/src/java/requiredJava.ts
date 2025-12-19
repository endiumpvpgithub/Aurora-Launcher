import { fetchVersionManifest } from "../minecraft/vanilla.js";

type RawVersionJson = { javaVersion?: { majorVersion?: number } };

/**
 * Résout la version majeure de Java requise pour un `gameVersion` donné.
 *
 * - Sur les versions récentes, Mojang expose `javaVersion.majorVersion` dans le version json.
 * - Pour les versions plus anciennes, ce champ peut être absent -> fallback Java 8.
 */
export async function resolveRequiredJavaMajor(gameVersion: string): Promise<number> {
  const manifest = await fetchVersionManifest();
  const meta = manifest.versions.find((v) => v.id === gameVersion);
  if (!meta) throw new Error(`Version Minecraft inconnue: ${gameVersion}`);

  const res = await fetch(meta.url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Version json HTTP ${res.status}`);
  const json = (await res.json()) as RawVersionJson;

  const major = json.javaVersion?.majorVersion;
  if (typeof major === "number" && Number.isFinite(major) && major > 0) return major;
  return 8;
}

