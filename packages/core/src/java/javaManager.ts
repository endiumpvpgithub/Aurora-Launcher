import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import * as tar from "tar";
import extractZip from "extract-zip";
import type { AppPaths } from "../paths/appPaths.js";

export type JavaRuntime = {
  major: number;
  homeDir: string;
  javaPath: string;
};

function detectPlatform() {
  const platform = os.platform();
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "mac";
  return "linux";
}

function detectArch() {
  const arch = os.arch();
  if (arch === "x64") return "x64";
  if (arch === "arm64") return "aarch64";
  throw new Error(`Architecture non supportée: ${arch}`);
}

function getJavaExecutable(runtimeHome: string): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(runtimeHome, "Contents", "Home", "bin", "java");
  }
  if (platform === "win32") {
    // javaw évite une console supplémentaire.
    return path.join(runtimeHome, "bin", "javaw.exe");
  }
  return path.join(runtimeHome, "bin", "java");
}

async function pathExists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from: string, to: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dst);
    } else if (entry.isSymbolicLink()) {
      const link = await fs.readlink(src);
      await fs.symlink(link, dst);
    } else {
      await fs.copyFile(src, dst);
    }
  }
}

/**
 * Télécharge un JRE Temurin depuis Adoptium, puis l’extrait dans le dossier data.
 * Objectif : le launcher fonctionne **sans Java préinstallé**.
 */
export async function ensureJavaRuntime(paths: AppPaths, major: number): Promise<JavaRuntime> {
  const baseDir = path.join(paths.dataDir, "runtimes");
  const runtimeDir = path.join(baseDir, `temurin-jre-${major}`);
  const javaPath = getJavaExecutable(runtimeDir);

  if (await pathExists(javaPath)) return { major, homeDir: runtimeDir, javaPath };

  await mkdir(baseDir, { recursive: true });

  const platform = detectPlatform();
  const arch = detectArch();
  const extension = platform === "windows" ? "zip" : "tar.gz";
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${platform}/${arch}/jre/hotspot/normal/eclipse?project=jdk`;

  const tmpDir = path.join(paths.tempDir, "aurora");
  await mkdir(tmpDir, { recursive: true });

  const archivePath = path.join(tmpDir, `temurin-jre-${major}-${platform}-${arch}.${extension}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Java download HTTP ${res.status}`);

  await pipeline(res.body as any, createWriteStream(archivePath));

  const extractTo = path.join(tmpDir, `extract-${Date.now()}`);
  await mkdir(extractTo, { recursive: true });

  if (archivePath.endsWith(".zip")) {
    await extractZip(archivePath, { dir: extractTo });
  } else {
    await tar.x({ file: archivePath, cwd: extractTo });
  }

  const roots = await readdir(extractTo);
  const root = roots[0];
  if (!root) throw new Error("Archive Java invalide (vide)");

  await copyDir(path.join(extractTo, root), runtimeDir);

  if (!(await pathExists(javaPath))) {
    throw new Error(`Java runtime installé mais java introuvable: ${javaPath}`);
  }

  return { major, homeDir: runtimeDir, javaPath };
}

/**
 * Détecte la version majeure d’un exécutable Java (via `java -version`).
 * Utile pour vérifier une config Java “custom” et détecter les incompatibilités.
 */
export async function detectJavaMajor(javaPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(javaPath, ["-version"], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString("utf-8")));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`java -version exit ${code}`));
      // Ex: openjdk version "21.0.4" 2024-07-16
      const match = stderr.match(/version \"(\d+)/);
      if (!match) return reject(new Error(`Impossible de parser java -version: ${stderr}`));
      resolve(Number(match[1]));
    });
  });
}
