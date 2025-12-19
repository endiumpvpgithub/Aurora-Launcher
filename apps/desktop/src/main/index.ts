import { BrowserWindow, app, ipcMain, shell } from "electron";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, stat, writeFile, rm, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import pathFs from "node:path";
import { createInterface } from "node:readline";
import type { AppPaths, LauncherConfig, Profile } from "@aurora/core" with { "resolution-mode": "import" };
import { autoUpdater } from "electron-updater";
import { SecureVault } from "./secureVault";

const APP_NAME = "AuroraLauncher";
const SECRET_MS_REFRESH = "ms.refreshToken";
const DEMO_ACCOUNT_UUID = "00000000000000000000000000000000";

let corePromise: Promise<any> | null = null;
function getCore(): Promise<any> {
  corePromise ??= import("@aurora/core");
  return corePromise;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1060,
    height: 720,
    backgroundColor: "#0b1020",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/index.js")
    }
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
  return win;
}

type RemoteSnapshot = {
  maintenance: { enabled: boolean; message?: string };
  news: { title?: string; items: Array<{ id: string; title: string; body: string; url?: string; date?: string }> };
};

let remoteSnapshot: RemoteSnapshot | null = null;
let mainWindow: BrowserWindow | null = null;
const serverProcesses = new Map<string, ChildProcessWithoutNullStreams>();
const serverPlayers = new Map<string, Set<string>>();
const serverLogReaders = new Map<string, Array<ReturnType<typeof createInterface>>>();
const serverListThrottle = new Map<string, number>();
const serverAutoFixing = new Set<string>();
const serverAutoFixTargets = new Map<string, number>();
const launchRecoveryAttempts = new Map<string, number>();
const launchRecoveryInFlight = new Set<string>();
const PLUGIN_CATALOG = [
  {
    id: "minimap-plus",
    name: "Minimap+",
    version: "1.0.0",
    description: "Mini-carte compacte avec waypoints, utile en survie.",
    tags: ["client", "cosmétique"]
  },
  {
    id: "perf-boost",
    name: "Perf Boost",
    version: "1.1.0",
    description: "Réglages JVM + indicateurs FPS/mémoire (overlay).",
    tags: ["outil", "diagnostic"]
  },
  {
    id: "rp-switcher",
    name: "RP Switcher",
    version: "0.4.2",
    description: "Gestion rapide des packs de ressources (profils).",
    tags: ["qualité de vie"]
  }
];

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function resolveMsClientId(config: LauncherConfig): string | undefined {
  return getEnv("AURORA_MS_CLIENT_ID") ?? (config.msClientId?.trim() || undefined);
}

function resolveCurseforgeKey(config: LauncherConfig): string | undefined {
  return getEnv("AURORA_CURSEFORGE_API_KEY") ?? (config.curseforgeApiKey?.trim() || undefined);
}

function createId() {
  return crypto.randomUUID();
}

function stripAnsi(input: string) {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function classFileVersionToJavaMajor(classVersion: number): number | null {
  if (!Number.isFinite(classVersion)) return null;
  const major = classVersion - 44;
  if (major < 8 || major > 30) return null;
  return major;
}

function detectRequiredJavaMajorFromLog(line: string): number | null {
  const clean = stripAnsi(line);
  if (!/class file version/i.test(clean)) return null;
  const matches = Array.from(clean.matchAll(/class file version\s+(\d+)(?:\.\d+)?/gi));
  if (!matches.length) return null;
  const classVersion = Math.max(...matches.map((m) => Number(m[1])));
  return classFileVersionToJavaMajor(classVersion);
}

function isMissingLibrariesError(err: any): err is { error: string; libraries: any[] } {
  if (!err) return false;
  if (err.error === "MissingLibraries" && Array.isArray(err.libraries)) return true;
  const message = String(err.message ?? err);
  return /Missing\s+\d+\s+libraries/i.test(message);
}

async function repairMissingLibrariesForLaunch(core: any, instanceDir: string, libraries: any[]) {
  const mcRoot = core.getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });
  const targets = Array.isArray(libraries) ? libraries : [];
  await Promise.all(
    targets.map(async (lib) => {
      const libPath = lib?.path;
      if (!libPath) return;
      const fullPath = pathFs.join(mcRoot, "libraries", libPath);
      await rm(fullPath, { force: true }).catch(() => {});
    })
  );
  if (targets.length) {
    await core.installResolvedLibraries(targets, mcRoot, {
      librariesDownloadConcurrency: 6,
      mavenHost: ["https://libraries.minecraft.net/", "https://repo1.maven.org/maven2/"]
    });
  }
}

async function autoRepairAfterCrash(
  core: any,
  instanceDir: string,
  versionId: string,
  crashReportLocation?: string
): Promise<boolean> {
  const mcRoot = core.getMinecraftRoot(instanceDir);
  await mkdir(mcRoot, { recursive: true });

  let forceAssetRepair = false;
  if (crashReportLocation) {
    const readCrash = async () => {
      try {
        return await readFile(crashReportLocation, "utf-8");
      } catch {
        return "";
      }
    };
    let text = await readCrash();
    if (!text) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      text = await readCrash();
    }
    forceAssetRepair = /png header missing/i.test(text);
  }

  let report: any = null;
  try {
    report = await core.diagnose(versionId, mcRoot, forceAssetRepair ? { strict: true } : undefined);
  } catch {
    report = null;
  }

  const issues = report?.issues ?? [];
  if (!issues.length && !forceAssetRepair) return false;

  const libraryIssues = issues.filter((i: any) => i.role === "library");
  if (libraryIssues.length) {
    await core.installResolvedLibraries(
      libraryIssues.map((i: any) => i.library),
      mcRoot,
      {
        librariesDownloadConcurrency: 6,
        mavenHost: ["https://libraries.minecraft.net/", "https://repo1.maven.org/maven2/"]
      }
    );
  }

  const needsAssets = forceAssetRepair || issues.some((i: any) => i.role === "asset" || i.role === "assetIndex");
  const needsJar = issues.some((i: any) => i.role === "minecraftJar" || i.role === "versionJson");

  if (needsAssets || libraryIssues.length) {
    try {
      const resolved = await core.Version.parse(mcRoot, versionId);
      await core.installDependencies(resolved, {
        side: "client",
        librariesDownloadConcurrency: 6,
        assetsDownloadConcurrency: 8,
        mavenHost: ["https://libraries.minecraft.net/", "https://repo1.maven.org/maven2/"]
      });
    } catch {
      // ignore, we'll surface the crash to logs
    }
  }

  if (needsJar) {
    try {
      const manifest = await core.fetchVersionManifest();
      const meta = (manifest?.versions ?? []).find((v: any) => v.id === versionId);
      if (meta) {
        await core.installVersion(meta, mcRoot, { side: "client" });
      }
    } catch {
      // ignore
    }
  }

  return needsAssets || libraryIssues.length > 0 || needsJar;
}

function updatePlayersFromLine(serverId: string, line: string) {
  const clean = stripAnsi(line);
  const set = serverPlayers.get(serverId) ?? new Set<string>();

  const joinMatch = clean.match(/\]:\s*([A-Za-z0-9_]+)\s+joined the game/i);
  if (joinMatch?.[1]) set.add(joinMatch[1]);

  const leftMatch = clean.match(/\]:\s*([A-Za-z0-9_]+)\s+left the game/i);
  if (leftMatch?.[1]) set.delete(leftMatch[1]);

  const listMatch =
    clean.match(/There are \d+ of a max of \d+ players online:?\s*(.*)$/i) ||
    clean.match(/There are \d+\/\d+ players online:?\s*(.*)$/i);
  if (listMatch) {
    const namesRaw = (listMatch[1] ?? "").trim();
    const names = namesRaw ? namesRaw.split(/,\s*/).filter(Boolean) : [];
    set.clear();
    names.forEach((n) => set.add(n));
  }

  if (!serverPlayers.has(serverId)) serverPlayers.set(serverId, set);
}

async function pathExists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function tailFile(filePath: string, maxBytes = 64_000): Promise<string> {
  try {
    const exists = await pathExists(filePath);
    if (!exists) return "";
    const buf = await readFile(filePath);
    if (buf.length <= maxBytes) return buf.toString("utf-8");
    return buf.subarray(buf.length - maxBytes).toString("utf-8");
  } catch {
    return "";
  }
}

async function refreshRemoteConfig(config: LauncherConfig) {
  const core = await getCore();
  const url = getEnv("AURORA_REMOTE_CONFIG_URL") ?? config.remoteConfigUrl;
  if (!url) {
    remoteSnapshot = null;
    return;
  }
  remoteSnapshot = await core.fetchRemoteConfig(url);
}

async function startMicrosoftLogin(config: LauncherConfig, vault: SecureVault) {
  const core = await getCore();
  const clientId = resolveMsClientId(config);
  if (!clientId) {
    throw new Error("Client ID manquant. Renseigne `msClientId` dans l’app (Paramètres) ou `AURORA_MS_CLIENT_ID`.");
  }

  const pkce = core.createPkcePair();
  const state = crypto.randomUUID();

  const server = http.createServer();
  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login Microsoft: timeout")), 180_000);
    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }
        const receivedState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!code || !receivedState || receivedState !== state) {
          res
            .writeHead(400, { "content-type": "text/plain; charset=utf-8" })
            .end("Paramètres OAuth invalides.");
          return;
        }
        res
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end("<h2>Connexion réussie</h2><p>Vous pouvez fermer cette fenêtre.</p>");
        clearTimeout(timeout);
        resolve(code);
      } catch (e) {
        reject(e);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Impossible d’ouvrir le serveur loopback");
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;

  const authUrl = core.buildMicrosoftAuthorizeUrl({ clientId, redirectUri }, pkce, state);
  await shell.openExternal(authUrl);

  const code = await codePromise.finally(() => server.close());

  const tokens = await core.exchangeMicrosoftCodeForTokens({ clientId, redirectUri }, code, pkce.verifier);
  await vault.set(SECRET_MS_REFRESH, tokens.refreshToken);

  const mc = await core.authenticateMicrosoftToMinecraft(tokens.accessToken);
  return { uuid: mc.profile.id, name: mc.profile.name };
}

async function getMinecraftSession(config: LauncherConfig, vault: SecureVault) {
  const core = await getCore();
  const clientId = resolveMsClientId(config);
  if (!clientId) {
    throw new Error("Client ID manquant. Renseigne `msClientId` dans l’app (Paramètres) ou `AURORA_MS_CLIENT_ID`.");
  }

  const refreshToken = await vault.get(SECRET_MS_REFRESH);
  if (!refreshToken) throw new Error("Non connecté. Veuillez vous authentifier.");

  const tokens = await core.refreshMicrosoftTokens({ clientId, redirectUri: "http://localhost" }, refreshToken);
  await vault.set(SECRET_MS_REFRESH, tokens.refreshToken);

  const mc = await core.authenticateMicrosoftToMinecraft(tokens.accessToken);
  return { accessToken: mc.minecraftAccessToken, uuid: mc.profile.id, name: mc.profile.name };
}

async function ensureProfileInstalled(paths: AppPaths, profile: Profile, javaPath: string) {
  const core = await getCore();
  await core.ensureInstanceDirs(paths, profile.instanceDir);

  // Base vanilla
  await core.ensureVanillaInstalled(profile.instanceDir, profile.gameVersion);

  const mcRoot = path.join(profile.instanceDir, ".minecraft");
  const hasVersion = async (versionId: string) => core.isVersionInstalled(mcRoot, versionId);

  if (profile.loader.type === "vanilla") {
    return { resolvedVersionId: profile.gameVersion };
  }

  if (profile.loader.type === "fabric") {
    const expected = `fabric-loader-${profile.loader.loaderVersion}-${profile.gameVersion}`;
    if (!(await hasVersion(expected))) {
      await core.installFabric(paths, profile.instanceDir, profile.gameVersion, profile.loader.loaderVersion);
    }
    return { resolvedVersionId: expected };
  }

  if (profile.loader.type === "legacyfabric") {
    const expected = `fabric-loader-${profile.loader.loaderVersion}-${profile.gameVersion}`;
    if (!(await hasVersion(expected))) {
      await core.installLegacyFabric(paths, profile.instanceDir, profile.gameVersion, profile.loader.loaderVersion);
    }
    return { resolvedVersionId: expected };
  }

  if (profile.loader.type === "quilt") {
    const expected = `${profile.gameVersion}-quilt${profile.loader.loaderVersion}`;
    if (!(await hasVersion(expected))) {
      await core.installQuilt(paths, profile.instanceDir, profile.gameVersion, profile.loader.loaderVersion);
    }
    return { resolvedVersionId: expected };
  }

  if (profile.loader.type === "forge") {
    // Le nom final peut varier selon l’installer; on utilise le résultat retourné et on le mémorise.
    if (profile.resolvedVersionId && (await hasVersion(profile.resolvedVersionId))) {
      return { resolvedVersionId: profile.resolvedVersionId };
    }
    const versionId = await core.installForgeVersion(
      paths,
      profile.instanceDir,
      javaPath,
      profile.gameVersion,
      profile.loader.forgeVersion
    );
    return { resolvedVersionId: versionId };
  }

  if (profile.loader.type === "neoforge") {
    if (profile.resolvedVersionId && (await hasVersion(profile.resolvedVersionId))) {
      return { resolvedVersionId: profile.resolvedVersionId };
    }
    const versionId = await core.installNeoForgeVersion(
      paths,
      profile.instanceDir,
      javaPath,
      profile.loader.neoForgeVersion
    );
    return { resolvedVersionId: versionId };
  }

  throw new Error("Loader non supporté");
}

async function main() {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.aurora.launcher");
  }

  await app.whenReady();
  mainWindow = createMainWindow();

  const core = await getCore();
  const paths = core.getAppPaths(APP_NAME);
  const pluginRoot = pathFs.join(paths.dataDir, "plugins");
  const configStore = core.createFileConfigStore(paths);
  const vault = new SecureVault(paths.configDir);

  async function waitForServerExit(serverId: string, timeoutMs = 8000) {
    const start = Date.now();
    while (serverProcesses.has(serverId) && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async function resolveServerJava(server: any, forcedMajor?: number) {
    const requiredMajor = forcedMajor ?? (await core.resolveRequiredJavaMajor(server.gameVersion));
    const runtime = await core.ensureJavaRuntime(paths, requiredMajor);
    let javaPath = runtime.javaPath;

    if (server.java?.javaPath) {
      try {
        const detected = await core.detectJavaMajor(server.java.javaPath);
        if (detected === requiredMajor) {
          javaPath = server.java.javaPath;
        }
      } catch {
        javaPath = runtime.javaPath;
      }
    }

    return { javaPath, requiredMajor };
  }

  async function startManagedServer(serverId: string, options?: { forcedJavaMajor?: number }) {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");

    if (serverProcesses.has(serverId)) {
      return { running: true };
    }

    const accepted = await core.readEulaAccepted(server.serverDir);
    if (!accepted) throw new Error("EULA non acceptée. Coche l'acceptation avant de démarrer.");

    const { javaPath } = await resolveServerJava(server, options?.forcedJavaMajor);

    const props = await core.readServerProperties(server.serverDir);
    props["server-port"] = String(server.port ?? 25565);
    await core.writeServerProperties(server.serverDir, props);

    const args = [
      `-Xms${server.java?.minRamMiB ?? 1024}M`,
      `-Xmx${server.java?.maxRamMiB ?? 2048}M`,
      ...(server.java?.jvmArgs ?? []),
      "-jar",
      core.getServerJarPath(server.serverDir),
      ...(server.nogui === false ? [] : ["nogui"])
    ];

    const child = spawn(javaPath, args, {
      cwd: server.serverDir,
      stdio: "pipe"
    });

    serverProcesses.set(serverId, child);

    const onLine = (line: string) => {
      updatePlayersFromLine(serverId, line);
      const requiredMajor = detectRequiredJavaMajorFromLog(line);
      if (requiredMajor) {
        void autoFixJavaForServer(serverId, requiredMajor);
      }
    };

    const rlOut = createInterface({ input: child.stdout });
    rlOut.on("line", onLine);
    const rlErr = createInterface({ input: child.stderr });
    rlErr.on("line", onLine);
    serverLogReaders.set(serverId, [rlOut, rlErr]);

    child.on("exit", () => {
      serverProcesses.delete(serverId);
      serverPlayers.delete(serverId);
      const readers = serverLogReaders.get(serverId);
      if (readers?.length) {
        readers.forEach((r) => r.close());
        serverLogReaders.delete(serverId);
      }
    });

    const logPath = pathFs.join(server.serverDir, "aurora-server.log");
    const logStream = createWriteStream(logPath, { flags: "a" });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    return { running: true, pid: child.pid };
  }

  async function autoFixJavaForServer(serverId: string, requiredMajor: number) {
    if (serverAutoFixing.has(serverId)) return;
    if (serverAutoFixTargets.get(serverId) === requiredMajor) return;

    serverAutoFixing.add(serverId);
    serverAutoFixTargets.set(serverId, requiredMajor);

    try {
      console.warn(`[server:${serverId}] Java incompatible détecté. Téléchargement Java ${requiredMajor}...`);
      const proc = serverProcesses.get(serverId);
      if (proc) {
        try {
          proc.stdin.write("stop\n");
        } catch {
          // ignore
        }
        setTimeout(() => {
          try {
            proc.kill();
          } catch {
            // ignore
          }
        }, 2000);
      }

      await waitForServerExit(serverId);
      await core.ensureJavaRuntime(paths, requiredMajor);
      await startManagedServer(serverId, { forcedJavaMajor: requiredMajor });
    } catch (err) {
      serverAutoFixTargets.delete(serverId);
      console.error(`[server:${serverId}] Auto-fix Java échoué`, err);
    } finally {
      serverAutoFixing.delete(serverId);
    }
  }

  // Auto-update via GitHub Releases (electron-updater)
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // silencieux en dev/offline
  });

  ipcMain.handle("state:get", async () => {
    const config = await configStore.load();
    await refreshRemoteConfig(config).catch(() => (remoteSnapshot = null));
    const clientId = resolveMsClientId(config);
    return {
      appVersion: app.getVersion(),
      hasMsClientId: !!clientId,
      hasCurseforgeKey: !!resolveCurseforgeKey(config),
      authUiMode: clientId ? "real" : "demo",
      config,
      remote: remoteSnapshot
    };
  });

  ipcMain.handle("config:save", async (_e, next: LauncherConfig) => {
    await configStore.save(next);
    return configStore.load();
  });

  ipcMain.handle("auth:login", async () => {
    const config = await configStore.load();
    if (!config.online) {
      // Offline "login" : on valide juste un pseudo local.
      const name =
        (config.account?.type === "offline" ? config.account.name : undefined) ??
        os.userInfo().username ??
        "Player";
      const next: LauncherConfig = {
        ...config,
        account: { type: "offline", name, lastLoginAt: Date.now() }
      };
      await configStore.save(next);
      return next.account;
    }

    const hasClientId = !!resolveMsClientId(config);
    // Mode démo : permet juste de visualiser l’UI sans créer d’app.
    const account = hasClientId ? await startMicrosoftLogin(config, vault) : { uuid: DEMO_ACCOUNT_UUID, name: "DemoUser" };
    const next: LauncherConfig = {
      ...config,
      account: { type: "msa", uuid: account.uuid, name: account.name, lastLoginAt: Date.now() }
    };
    await configStore.save(next);
    return next.account;
  });

  ipcMain.handle("auth:logout", async () => {
    await vault.delete(SECRET_MS_REFRESH);
    const config = await configStore.load();
    const next: LauncherConfig = { ...config, account: undefined };
    await configStore.save(next);
    return true;
  });

  ipcMain.handle("auth:offline:setName", async (_e, name: string) => {
    const config = await configStore.load();
    const clean = String(name ?? "").trim();
    if (clean.length < 3) throw new Error("Pseudo offline: 3 caractères minimum");
    if (/\s/.test(clean)) throw new Error("Pseudo offline: pas d'espaces");
    const next: LauncherConfig = {
      ...config,
      online: false,
      account: { type: "offline", name: clean, lastLoginAt: Date.now() }
    };
    await configStore.save(next);
    return next.account;
  });

  ipcMain.handle("versions:manifest", async () => core.fetchVersionManifest());

  ipcMain.handle("server:ping", async (_e, host: string, port?: number) =>
    core.pingMinecraftServer(host, port ?? 25565)
  );

  ipcMain.handle("profiles:create", async (_e, partial: Partial<Profile>) => {
    const config = await configStore.load();
    const id = crypto.randomUUID();
    const instanceDir = core.getDefaultInstanceDir(paths, id);
    const profile: Profile = {
      id,
      name: partial.name ?? "Profil",
      gameVersion: partial.gameVersion ?? (await core.fetchVersionManifest()).latest.release,
      loader: partial.loader ?? { type: "vanilla" },
      instanceDir,
      java: partial.java ?? { minRamMiB: 2048, maxRamMiB: 4096, jvmArgs: [] }
    } as Profile;
    const next: LauncherConfig = { ...config, profiles: [...config.profiles, profile], selectedProfileId: id };
    await configStore.save(next);
    return next;
  });

  ipcMain.handle("profiles:select", async (_e, id: string) => {
    const config = await configStore.load();
    const next: LauncherConfig = { ...config, selectedProfileId: id };
    await configStore.save(next);
    return next;
  });

  /**
   * Managed Servers (local)
   */
  ipcMain.handle("servers:managed:create", async (_e, input: { name: string; gameVersion: string; port?: number }) => {
    const config = await configStore.load();
    const id = createId();
    const serverDir = pathFs.join(paths.dataDir, "servers", id);
    await mkdir(serverDir, { recursive: true });

    const port = input.port ?? 25565;

    const server = {
      id,
      name: input.name?.trim() || "Serveur",
      gameVersion: input.gameVersion?.trim() || (await core.fetchVersionManifest()).latest.release,
      serverDir,
      java: { minRamMiB: 1024, maxRamMiB: 2048, jvmArgs: [] as string[] },
      port,
      nogui: true
    };

    // Install vanilla server.jar
    await core.installVanillaServer(serverDir, server.gameVersion);

    // Apply port in server.properties
    const props = await core.readServerProperties(serverDir);
    props["server-port"] = String(port);
    await core.writeServerProperties(serverDir, props);

    const next: LauncherConfig = {
      ...config,
      managedServers: [...(config.managedServers ?? []), server]
    };
    await configStore.save(next);
    return next;
  });

  ipcMain.handle("servers:managed:list", async () => {
    const config = await configStore.load();
    return config.managedServers ?? [];
  });

  ipcMain.handle("servers:managed:eula", async (_e, serverId: string, accepted: boolean) => {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");
    await core.setEulaAccepted(server.serverDir, !!accepted);
    return { accepted: await core.readEulaAccepted(server.serverDir) };
  });

  ipcMain.handle("servers:managed:start", async (_e, serverId: string) => {
    return startManagedServer(serverId);
  });

  ipcMain.handle("servers:managed:stop", async (_e, serverId: string) => {
    const proc = serverProcesses.get(serverId);
    if (!proc) return { running: false };
    try {
      proc.stdin.write("stop\n");
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }, 5000);
    return { running: true };
  });

  ipcMain.handle("servers:managed:status", async (_e, serverId: string) => {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");

    const running = serverProcesses.has(serverId);
    const accepted = await core.readEulaAccepted(server.serverDir);
    const props = await core.readServerProperties(server.serverDir);
    const port = Number(props["server-port"] ?? server.port ?? 25565);
    const ping = await core.pingMinecraftServer("127.0.0.1", port).catch((e: any) => ({
      online: false,
      error: String(e)
    }));
    const logPath = pathFs.join(server.serverDir, "aurora-server.log");
    const log = await tailFile(logPath, 40_000);
    const players = Array.from(serverPlayers.get(serverId) ?? []);
    const now = Date.now();
    const last = serverListThrottle.get(serverId) ?? 0;
    if (running && now - last > 15000) {
      const proc = serverProcesses.get(serverId);
      try {
        proc?.stdin.write("list\n");
      } catch {
        // ignore
      }
      serverListThrottle.set(serverId, now);
    }

    return { running, acceptedEula: accepted, ping, log, players };
  });

  ipcMain.handle("servers:managed:properties:get", async (_e, serverId: string) => {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");
    const props = await core.readServerProperties(server.serverDir);
    return { properties: props };
  });

  ipcMain.handle("servers:managed:properties:set", async (_e, serverId: string, patch: Record<string, string>) => {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");
    const props = await core.readServerProperties(server.serverDir);
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (!k) continue;
      props[k] = String(v);
    }
    await core.writeServerProperties(server.serverDir, props);
    return { ok: true };
  });

  ipcMain.handle("servers:managed:command", async (_e, serverId: string, command: string) => {
    const proc = serverProcesses.get(serverId);
    if (!proc) throw new Error("Serveur non démarré");
    const line = (command ?? "").trim();
    if (!line) return { ok: true };
    proc.stdin.write(`${line}\n`);
    return { ok: true };
  });

  ipcMain.handle("servers:managed:openDir", async (_e, serverId: string) => {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");
    await shell.openPath(server.serverDir);
    return { ok: true };
  });

  ipcMain.handle("servers:managed:files:list", async (_e, serverId: string) => {
    const config = await configStore.load();
    const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
    if (!server) throw new Error("Serveur introuvable");
    const entries = await readdir(server.serverDir, { withFileTypes: true });
    const list = await Promise.all(
      entries.map(async (d) => {
        const fp = pathFs.join(server.serverDir, d.name);
        const st = await stat(fp);
        return {
          name: d.name,
          isDir: d.isDirectory(),
          size: st.size,
          mtime: st.mtimeMs
        };
      })
    );
    return list;
  });

  ipcMain.handle(
    "servers:managed:version:set",
    async (_e, serverId: string, gameVersion: string, loader?: string) => {
      const config = await configStore.load();
      const server = (config.managedServers ?? []).find((s: any) => s.id === serverId);
      if (!server) throw new Error("Serveur introuvable");
      const nextVersion = gameVersion?.trim();
      if (!nextVersion) throw new Error("Version invalide");
      const chosenLoader = (loader ?? server.serverLoader ?? "vanilla").toLowerCase();

      if (chosenLoader === "paper" || chosenLoader === "spigot") {
        await core.installPaperServer(server.serverDir, nextVersion);
      } else {
        // Fallback vanilla pour forge/neoforge/fabric/arclight en attendant un installer dédié
        await core.installVanillaServer(server.serverDir, nextVersion);
      }

      const props = await core.readServerProperties(server.serverDir);
      props["server-port"] = String(server.port ?? 25565);
      await core.writeServerProperties(server.serverDir, props);
      const next = {
        ...config,
        managedServers: (config.managedServers ?? []).map((s: any) =>
          s.id === serverId ? { ...s, gameVersion: nextVersion, serverLoader: chosenLoader } : s
        )
      };
      await configStore.save(next);
      return next.managedServers;
    }
  );

  /**
   * Plugins (store local côté client)
   */
  ipcMain.handle("plugins:store:list", async () => {
    return PLUGIN_CATALOG;
  });

  ipcMain.handle("plugins:installed:list", async () => {
    const config = await configStore.load();
    return config.plugins ?? [];
  });

  ipcMain.handle("plugins:install", async (_e, pluginId: string) => {
    const catalogItem = PLUGIN_CATALOG.find((p) => p.id === pluginId);
    if (!catalogItem) throw new Error("Plugin introuvable dans le store");

    const config = await configStore.load();
    const already = (config.plugins ?? []).find((p: any) => p.id === pluginId);
    if (already) return config.plugins;

    await mkdir(pluginRoot, { recursive: true });
    const manifestPath = pathFs.join(pluginRoot, `${pluginId}.json`);
    await writeFile(
      manifestPath,
      JSON.stringify({ ...catalogItem, installedAt: Date.now(), enabled: true }, null, 2),
      "utf-8"
    );

    const next = {
      ...config,
      plugins: [...(config.plugins ?? []), { ...catalogItem, enabled: true, installedAt: Date.now() }]
    };
    await configStore.save(next);
    return next.plugins;
  });

  ipcMain.handle("plugins:toggle", async (_e, pluginId: string, enabled: boolean) => {
    const config = await configStore.load();
    const plugins = (config.plugins ?? []).map((p: any) => (p.id === pluginId ? { ...p, enabled } : p));
    const next = { ...config, plugins };
    await configStore.save(next);
    return plugins;
  });

  ipcMain.handle("plugins:remove", async (_e, pluginId: string) => {
    const config = await configStore.load();
    const plugins = (config.plugins ?? []).filter((p: any) => p.id !== pluginId);
    const next = { ...config, plugins };
    await configStore.save(next);
    const manifestPath = pathFs.join(pluginRoot, `${pluginId}.json`);
    await rm(manifestPath, { force: true });
    return plugins;
  });

  ipcMain.handle("plugins:openDir", async () => {
    await mkdir(pluginRoot, { recursive: true });
    await shell.openPath(pluginRoot);
    return { ok: true };
  });

  ipcMain.handle("curseforge:search", async (_e, query: string) => {
    const config = await configStore.load();
    const key = resolveCurseforgeKey(config);
    if (!key) throw new Error("CurseForge API key manquante (AURORA_CURSEFORGE_API_KEY ou champ curseforgeApiKey).");
    if (!query || !query.trim()) return [];
    return core.searchCurseforgeMods(key, query.trim(), 20);
  });

  ipcMain.handle(
    "curseforge:download",
    async (_e, input: { modId: number; fileId: number; fileName?: string; downloadUrl?: string }) => {
      const config = await configStore.load();
      const key = resolveCurseforgeKey(config);
      if (!key) throw new Error("CurseForge API key manquante (AURORA_CURSEFORGE_API_KEY ou champ curseforgeApiKey).");

      const dest = await core.downloadCurseforgeFile(
        key,
        input.modId,
        input.fileId,
        pluginRoot,
        input.fileName,
        input.downloadUrl
      );

      const id = `cf-${input.modId}`;
      const nextPlugins = [
        ...(config.plugins ?? []).filter((p: any) => p.id !== id),
        {
          id,
          name: pathFs.parse(dest).name,
          version: input.fileName ?? String(input.fileId),
          source: "curseforge",
          enabled: true,
          installedAt: Date.now(),
          curseforge: {
            modId: input.modId,
            fileId: input.fileId,
            fileName: input.fileName,
            downloadUrl: input.downloadUrl
          }
        }
      ];
      const next = { ...config, plugins: nextPlugins };
      await configStore.save(next);
      return nextPlugins;
    }
  );

  ipcMain.handle("play", async (_e, profileId: string) => {
    const config = await configStore.load();
    await refreshRemoteConfig(config).catch(() => (remoteSnapshot = null));
    if (remoteSnapshot?.maintenance?.enabled) {
      throw new Error(remoteSnapshot.maintenance.message ?? "Maintenance activée.");
    }

    const profile = config.profiles.find((p: Profile) => p.id === profileId);
    if (!profile) throw new Error("Profil introuvable");

    const core = await getCore();

    const session = (() => {
      if (!config.online) {
        const name =
          (config.account?.type === "offline" ? config.account.name : undefined) ??
          os.userInfo().username ??
          "Player";
        return {
          kind: "offline" as const,
          name,
          uuid: core.createOfflineUuid(name),
          accessToken: "0",
          userType: "legacy"
        };
      }

      const clientId = resolveMsClientId(config);
      if (!clientId) {
        throw new Error(
          "Mode démo : l’UI est disponible, mais le mode en ligne nécessite un Client ID (`msClientId` ou AURORA_MS_CLIENT_ID)."
        );
      }
      return null;
    })();

    const resolvedSession =
      session ?? ({
        ...(await getMinecraftSession(config, vault)),
        kind: "msa" as const,
        userType: "msa"
      } as const);

    // Java : par version MC (détection de version incompatible)
    const requiredMajor = await core.resolveRequiredJavaMajor(profile.gameVersion);
    const runtime = await core.ensureJavaRuntime(paths, requiredMajor);
    let chosenJava = profile.java.javaPath ?? runtime.javaPath;

    // Détection des incompatibilités si un Java custom est défini
    if (profile.java.javaPath) {
      try {
        const detected = await core.detectJavaMajor(profile.java.javaPath);
        if (detected !== requiredMajor) {
          // On bascule sur le runtime embarqué pour éviter un crash silencieux.
          chosenJava = runtime.javaPath;
        }
      } catch {
        chosenJava = runtime.javaPath;
      }
    }

    // Installation version/loader
    const installResult = await ensureProfileInstalled(paths, profile, chosenJava);

    const updatedProfile: Profile = { ...profile, resolvedVersionId: installResult.resolvedVersionId };
    const next: LauncherConfig = {
      ...config,
      profiles: config.profiles.map((p: Profile) => (p.id === profileId ? updatedProfile : p))
    };
    await configStore.save(next);

    const versionId = installResult.resolvedVersionId;

    const launchPayload = {
      javaPath: chosenJava,
      profile: updatedProfile,
      account: {
        name: resolvedSession.name,
        uuid: resolvedSession.uuid,
        accessToken: resolvedSession.accessToken,
        userType: resolvedSession.userType
      },
      versionId
    };

    const startAndWatch = async () => {
      const proc = await core.launchMinecraftProcess(launchPayload);
      const startAt = Date.now();

      const watcher = core.createMinecraftProcessWatcher(proc);
      watcher.on("minecraft-exit", async (event: any) => {
        const duration = Date.now() - startAt;
        if (event.code === 0) return;
        console.error(
          `[launcher] Minecraft exit code=${event.code} signal=${event.signal ?? "none"} crash=${event.crashReportLocation ?? "n/a"}`
        );
        const attempts = launchRecoveryAttempts.get(profileId) ?? 0;
        if (duration > 15000 || attempts >= 1 || launchRecoveryInFlight.has(profileId)) return;

        launchRecoveryAttempts.set(profileId, attempts + 1);
        launchRecoveryInFlight.add(profileId);
        try {
          const repaired = await autoRepairAfterCrash(
            core,
            updatedProfile.instanceDir,
            versionId,
            event.crashReportLocation
          );
          if (repaired) {
            await startAndWatch();
          }
        } catch (err) {
          console.error("[launcher] Auto-repair after crash failed", err);
        } finally {
          launchRecoveryInFlight.delete(profileId);
        }
      });

      return proc;
    };

    let launched;
    try {
      const proc = await startAndWatch();
      launched = { pid: proc.pid };
    } catch (err: any) {
      if (isMissingLibrariesError(err)) {
        const libs = Array.isArray(err.libraries) ? err.libraries : [];
        await repairMissingLibrariesForLaunch(core, updatedProfile.instanceDir, libs);
        const proc = await startAndWatch();
        launched = { pid: proc.pid };
      } else {
        throw err;
      }
    }

    return launched;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

main().catch((err) => {
  console.error(err);
  app.quit();
});
