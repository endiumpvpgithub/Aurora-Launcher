import { ChildProcess } from "node:child_process";
import type { Profile } from "../config/config.js";
import { getMinecraftRoot } from "./vanilla.js";
import { launch as xmclLaunch } from "@xmcl/core";

export type LaunchAccount = {
  name: string;
  uuid: string;
  accessToken: string;
  /**
   * Le champ `--userType` utilisé par Minecraft.
   * Le launcher officiel utilise généralement `msa` pour Microsoft.
   */
  userType?: string;
};

export type LaunchResult = { pid: number };

export type LaunchOptions = {
  javaPath: string;
  profile: Profile;
  account: LaunchAccount;
  /**
   * ID du dossier dans `.minecraft/versions/<versionId>/`.
   * Ex: `1.21.4`, `fabric-loader-0.16.2-1.21.4`, etc.
   */
  versionId: string;
};

/**
 * Construit une ligne de commande Java à partir du `version.json`.
 *
 * Pour rester léger, on s’appuie sur @xmcl/core pour le parsing + la génération
 * d’arguments (classpath, natives, etc).
 */
export async function launchMinecraftProcess(opts: LaunchOptions): Promise<ChildProcess> {
  const mcRoot = getMinecraftRoot(opts.profile.instanceDir);

  const proc: ChildProcess = await xmclLaunch({
    javaPath: opts.javaPath,
    gamePath: mcRoot,
    resourcePath: mcRoot,
    version: opts.versionId,
    maxMemory: opts.profile.java.maxRamMiB,
    minMemory: opts.profile.java.minRamMiB,
    extraJVMArgs: opts.profile.java.jvmArgs,
    accessToken: opts.account.accessToken,
    userType: (opts.account.userType ?? "msa") as any,
    gameProfile: {
      id: opts.account.uuid,
      name: opts.account.name
    }
  } as any);

  if (!proc.pid) throw new Error("Impossible de démarrer le processus Minecraft");
  return proc;
}

export async function launchMinecraft(opts: LaunchOptions): Promise<LaunchResult> {
  const proc = await launchMinecraftProcess(opts);
  return { pid: proc.pid! };
}
