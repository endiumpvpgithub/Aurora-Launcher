import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AppPaths } from "../paths/appPaths.js";

export const LoaderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vanilla") }),
  z.object({ type: z.literal("fabric"), loaderVersion: z.string().min(1) }),
  z.object({ type: z.literal("quilt"), loaderVersion: z.string().min(1) }),
  z.object({ type: z.literal("legacyfabric"), loaderVersion: z.string().min(1) }),
  z.object({ type: z.literal("forge"), forgeVersion: z.string().min(1) }),
  z.object({ type: z.literal("neoforge"), neoForgeVersion: z.string().min(1) })
]);

export type LoaderConfig = z.infer<typeof LoaderSchema>;

export const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  gameVersion: z.string().min(1),
  loader: LoaderSchema,
  /**
   * ID de version réellement installé dans `.minecraft/versions/<id>/`.
   * Permet de mémoriser le résultat exact d’un installer (Forge/NeoForge).
   */
  resolvedVersionId: z.string().min(1).optional(),
  /**
   * Dossier de l’instance (isolez les profils pour éviter les conflits).
   * Ex: <dataDir>/instances/<id>
   */
  instanceDir: z.string().min(1),
  /**
   * Paramètres Java & JVM (préférences par profil).
   */
  java: z
    .object({
      /**
       * Chemin java personnalisé (optionnel). Sinon Java auto-installé.
       */
      javaPath: z.string().optional(),
      minRamMiB: z.number().int().positive().default(2048),
      maxRamMiB: z.number().int().positive().default(4096),
      jvmArgs: z.array(z.string()).default([])
    })
    .default({ minRamMiB: 2048, maxRamMiB: 4096, jvmArgs: [] })
});

export type Profile = z.infer<typeof ProfileSchema>;

export const PluginSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  source: z.string().optional(),
  enabled: z.boolean().default(true),
  installedAt: z.number().int().positive().optional()
});

export const LauncherConfigSchema = z.object({
  schemaVersion: z.literal(1),
  /**
   * Mode en ligne :
   * - true  => auth Microsoft + serveurs online
   * - false => mode offline (pseudo local)
   */
  online: z.boolean().default(true),
  /**
   * Microsoft OAuth client id (public). Ce n'est pas un secret.
   * Permet d'éviter l'usage d'une variable d'environnement en dev (comme Selvania).
   */
  msClientId: z.string().min(1).optional(),
  /**
   * Clé API CurseForge pour rechercher/télécharger des plugins.
   * Optionnelle ; peut être définie via env ou UI.
   */
  curseforgeApiKey: z.string().min(1).optional(),
  /**
   * Informations non sensibles sur l’utilisateur connecté.
   * Les tokens (refresh/access) doivent rester chiffrés dans un vault séparé.
   */
  account: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal("msa"),
        uuid: z.string().min(1),
        name: z.string().min(1),
        lastLoginAt: z.number().int().nonnegative().optional()
      }),
      z.object({
        type: z.literal("offline"),
        name: z.string().min(3),
        lastLoginAt: z.number().int().nonnegative().optional()
      })
    ])
    .optional(),
  selectedProfileId: z.string().optional(),
  profiles: z.array(ProfileSchema).default([]),
  /**
   * Endpoints distants (news + maintenance). Peut aussi venir d’une env var.
   */
  remoteConfigUrl: z.string().url().optional(),
  /**
   * Liste de serveurs “favoris” pour le widget de statut.
   */
  servers: z
    .array(
      z.object({
        name: z.string().min(1),
        host: z.string().min(1),
        port: z.number().int().positive().default(25565)
      })
    )
    .default([]),
  /**
   * Serveurs Minecraft gérés par le launcher (local).
   * Chaque serveur possède son dossier isolé et ses paramètres (RAM, port...).
   */
  managedServers: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        /**
         * Version Minecraft (ex: 1.20.1)
         */
        gameVersion: z.string().min(1),
        /**
         * Dossier du serveur (contient server.jar, eula.txt, server.properties, world/, logs/…)
         */
        serverDir: z.string().min(1),
        /**
         * Type d'implémentation serveur (vanilla, paper, spigot…)
         */
        serverLoader: z.string().optional(),
        java: z
          .object({
            javaPath: z.string().optional(),
            minRamMiB: z.number().int().positive().default(1024),
            maxRamMiB: z.number().int().positive().default(2048),
            jvmArgs: z.array(z.string()).default([])
          })
          .default({ minRamMiB: 1024, maxRamMiB: 2048, jvmArgs: [] }),
        port: z.number().int().positive().default(25565),
        nogui: z.boolean().default(true)
      })
    )
    .default([]),
  /**
   * Plugins installés via le "store" du launcher (metadata locale).
   * Ce n'est pas une marketplace distante, juste une liste côté client.
   */
  plugins: z.array(PluginSchema).default([])
});

export type LauncherConfig = z.infer<typeof LauncherConfigSchema>;

export function getDefaultLauncherConfig(): LauncherConfig {
  return {
    schemaVersion: 1,
    online: true,
    profiles: [],
    servers: [],
    managedServers: [],
    // curseforgeApiKey initialisé à undefined par défaut
    curseforgeApiKey: undefined,
    plugins: []
  };
}

export type ConfigStore = {
  load(): Promise<LauncherConfig>;
  save(config: LauncherConfig): Promise<void>;
  path: string;
};

export function createFileConfigStore(paths: AppPaths): ConfigStore {
  const configFile = path.join(paths.configDir, "config.json");

  return {
    path: configFile,
    async load() {
      try {
        const raw = await readFile(configFile, "utf-8");
        const parsed = LauncherConfigSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) return getDefaultLauncherConfig();
        return parsed.data;
      } catch {
        return getDefaultLauncherConfig();
      }
    },
    async save(config: LauncherConfig) {
      await mkdir(path.dirname(configFile), { recursive: true });
      const validated = LauncherConfigSchema.parse(config);
      await writeFile(configFile, JSON.stringify(validated, null, 2), "utf-8");
    }
  };
}
