import envPaths from "env-paths";

export type AppPaths = {
  dataDir: string;
  configDir: string;
  cacheDir: string;
  logDir: string;
  tempDir: string;
};

/**
 * Résout des chemins multi-plateforme pour stocker :
 * - config (JSON)
 * - données (instances/.minecraft)
 * - cache (téléchargements, installers)
 * - logs
 */
export function getAppPaths(appName = "AuroraLauncher"): AppPaths {
  const paths = envPaths(appName, { suffix: "" });
  return {
    dataDir: paths.data,
    configDir: paths.config,
    cacheDir: paths.cache,
    logDir: paths.log,
    tempDir: paths.temp,
  };
}

