import React, { useEffect, useMemo, useState } from "react";

type LauncherState = {
  appVersion: string;
  hasMsClientId?: boolean;
  hasCurseforgeKey?: boolean;
  authUiMode?: "real" | "demo";
  config: any;
  remote: any;
};

export function App() {
  const [state, setState] = useState<LauncherState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [offlineName, setOfflineName] = useState<string>("");
  const [managedServers, setManagedServers] = useState<any[]>([]);
  const [managedSelectedId, setManagedSelectedId] = useState<string>("");
  const [managedStatus, setManagedStatus] = useState<any>(null);
  const [managedProps, setManagedProps] = useState<Record<string, string> | null>(null);
  const [managedCommand, setManagedCommand] = useState<string>("");
  const [newServerName, setNewServerName] = useState<string>("Mon serveur");
  const [newServerVersion, setNewServerVersion] = useState<string>("");
  const [newServerPort, setNewServerPort] = useState<number>(25565);
  const [pluginCatalog, setPluginCatalog] = useState<any[]>([]);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [curseQuery, setCurseQuery] = useState<string>("");
  const [curseResults, setCurseResults] = useState<any[]>([]);
  const [curseError, setCurseError] = useState<string | null>(null);
  const [curseBusy, setCurseBusy] = useState<boolean>(false);
  const [serverTab, setServerTab] = useState<string>("console");
  const consoleBodyRef = React.useRef<HTMLDivElement | null>(null);
  const [playerActionBusy, setPlayerActionBusy] = useState<string | null>(null);
  const [playerReason, setPlayerReason] = useState<string>("");
  const [playerNotice, setPlayerNotice] = useState<{ type: "ok" | "warn"; message: string } | null>(null);
  const [settingsFilter, setSettingsFilter] = useState<string>("");
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  const [fabricLoaders, setFabricLoaders] = useState<string[]>([]);
  const [quiltLoaders, setQuiltLoaders] = useState<string[]>([]);
  const [legacyFabricLoaders, setLegacyFabricLoaders] = useState<string[]>([]);
  const [forgeVersions, setForgeVersions] = useState<string[]>([]);
  const [neoForgeVersions, setNeoForgeVersions] = useState<string[]>([]);
  const [serverVersionChoice, setServerVersionChoice] = useState<string>("");

  const selectedProfile = useMemo(() => {
    if (!state) return null;
    const id = state.config?.selectedProfileId;
    return state.config?.profiles?.find((p: any) => p.id === id) ?? null;
  }, [state]);

  const pluginsMap = useMemo(() => {
    const map = new Map<string, any>();
    plugins.forEach((p) => map.set(p.id, p));
    return map;
  }, [plugins]);

  const selectedServer = useMemo(() => {
    if (!managedSelectedId) return null;
    return managedServers.find((s: any) => s.id === managedSelectedId) ?? null;
  }, [managedSelectedId, managedServers]);

  const filteredForgeVersions = useMemo(() => {
    if (!selectedProfile?.gameVersion) return forgeVersions;
    return forgeVersions.filter((v) => v.startsWith(`${selectedProfile.gameVersion}-`));
  }, [forgeVersions, selectedProfile?.gameVersion]);

  const quickServerSettings = useMemo(
    () => [
      { key: "motd", label: "MOTD", type: "text", hint: "Message visible dans la liste des serveurs." },
      { key: "max-players", label: "Joueurs max", type: "number", hint: "Limite de joueurs connectés." },
      { key: "difficulty", label: "Difficulté", type: "select", options: ["peaceful", "easy", "normal", "hard"] },
      { key: "gamemode", label: "Mode de jeu", type: "select", options: ["survival", "creative", "adventure", "spectator"] },
      { key: "online-mode", label: "Online mode", type: "boolean", hint: "Vérifie les comptes Microsoft." },
      { key: "pvp", label: "PVP", type: "boolean" },
      { key: "view-distance", label: "View distance", type: "number" },
      { key: "allow-flight", label: "Vol autorisé", type: "boolean" },
      { key: "white-list", label: "Whitelist", type: "boolean" },
      { key: "spawn-protection", label: "Protection spawn", type: "number" },
      { key: "enable-command-block", label: "Command blocks", type: "boolean" },
      { key: "level-name", label: "Nom du monde", type: "text" }
    ],
    []
  );

  function stripAnsi(input: string) {
    return input.replace(/\x1b\[[0-9;]*m/g, "");
  }

  function logClass(line: string) {
    const l = line.toLowerCase();
    if (l.includes("error")) return "error";
    if (l.includes("warn")) return "warn";
    if (l.includes("info")) return "info";
    if (l.includes("fatal")) return "error";
    return "default";
  }

  async function refresh() {
    setError(null);
    const s = await window.aurora.getState();
    setState(s);
    const list = await window.aurora.managedServersList().catch(() => []);
    setManagedServers(list);
    if (!managedSelectedId && list?.length) setManagedSelectedId(list[0].id);
    const catalog = await window.aurora.pluginStoreList().catch(() => []);
    setPluginCatalog(catalog);
    const installed = await window.aurora.pluginsInstalled().catch(() => []);
    setPlugins(installed);
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    async function loadVersionLists() {
      try {
        const manifest = await window.aurora.fetchManifest();
        const releases = (manifest?.versions ?? [])
          .filter((v: any) => v.type === "release")
          .map((v: any) => v.id);
        setMcVersions(releases);
      } catch {
        setMcVersions([]);
      }

      async function fetchJson(url: string) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      try {
        const fabric = await fetchJson("https://meta.fabricmc.net/v2/versions/loader");
        setFabricLoaders(Array.from(new Set(fabric.map((x: any) => x.loader.version))));
      } catch {
        setFabricLoaders([]);
      }
      try {
        const quilt = await fetchJson("https://meta.quiltmc.org/v3/versions/loader");
        setQuiltLoaders(Array.from(new Set(quilt.map((x: any) => x.loader.version))));
      } catch {
        setQuiltLoaders([]);
      }
      try {
        const legacy = await fetchJson("https://meta.legacyfabric.net/v2/versions/loader");
        setLegacyFabricLoaders(Array.from(new Set(legacy.map((x: any) => x.loader.version))));
      } catch {
        setLegacyFabricLoaders([]);
      }
      try {
        const res = await fetch("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml");
        const xml = await res.text();
        const versions = Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g)).map((m) => m[1]);
        setForgeVersions(versions.reverse());
      } catch {
        setForgeVersions([]);
      }
      try {
        const res = await fetch("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
        const xml = await res.text();
        const versions = Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g)).map((m) => m[1]);
        setNeoForgeVersions(versions.reverse());
      } catch {
        setNeoForgeVersions([]);
      }
    }
    loadVersionLists().catch(() => {});
  }, []);

  useEffect(() => {
    if (state?.config?.account?.type === "offline") {
      setOfflineName(state.config.account.name ?? "");
    } else if (offlineName.length === 0) {
      setOfflineName("Player");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.config?.account?.type]);

  useEffect(() => {
    let timer: any;
    async function tick() {
      if (!state?.config?.servers?.length) {
        setServerStatus(null);
        return;
      }
      const s = state.config.servers[0];
      const res = await window.aurora.ping(s.host, s.port);
      setServerStatus({ server: s, ...res });
    }
    tick().catch(() => {});
    timer = setInterval(() => tick().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [state?.config?.servers?.length]);

  useEffect(() => {
    let timer: any;
    async function tick() {
      if (!managedSelectedId) {
        setManagedStatus(null);
        setManagedProps(null);
        return;
      }
      const status = await window.aurora.managedServerStatus(managedSelectedId).catch(() => null);
      // Enrichir avec la liste de fichiers si disponible
      let files: any[] = [];
      try {
        files = await window.aurora.managedServerFilesList(managedSelectedId);
      } catch {
        files = [];
      }
      setManagedStatus(status ? { ...status, files } : status);
    }
    tick().catch(() => {});
    timer = setInterval(() => tick().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [managedSelectedId]);

  useEffect(() => {
    async function loadProps() {
      if (!managedSelectedId) return;
      const res = await window.aurora.managedServerPropertiesGet(managedSelectedId).catch(() => null);
      setManagedProps(res?.properties ?? null);
    }
    loadProps().catch(() => {});
  }, [managedSelectedId]);

  useEffect(() => {
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [managedStatus?.log]);

  useEffect(() => {
    if (selectedServer?.gameVersion) {
      setServerVersionChoice(selectedServer.gameVersion);
    }
  }, [selectedServer?.gameVersion]);

  useEffect(() => {
    if (!newServerVersion && mcVersions.length) {
      setNewServerVersion(mcVersions[0]);
    }
  }, [mcVersions, newServerVersion]);

  useEffect(() => {
    if (!playerNotice) return;
    const t = setTimeout(() => setPlayerNotice(null), 4000);
    return () => clearTimeout(t);
  }, [playerNotice]);

  async function searchCurseforge() {
    if (!curseQuery.trim()) {
      setCurseResults([]);
      return;
    }
    if (!hasCurseforgeKey) {
      setCurseError("Clé CurseForge manquante. Renseigne-la dans Paramètres ou via AURORA_CURSEFORGE_API_KEY.");
      return;
    }
    setCurseBusy(true);
    setCurseError(null);
    try {
      const res = await window.aurora.curseforgeSearch(curseQuery.trim());
      setCurseResults(res ?? []);
    } catch (e) {
      setCurseError(String(e));
    } finally {
      setCurseBusy(false);
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const account = state?.config?.account;
  const online = state?.config?.online !== false;
  const maintenance = state?.remote?.maintenance;
  const news = state?.remote?.news;
  const hasMsClientId = !!state?.hasMsClientId;
  const hasCurseforgeKey = !!state?.hasCurseforgeKey;
  const authUiMode = state?.authUiMode ?? (hasMsClientId ? "real" : "demo");

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Aurora Launcher</h1>
          <div className="muted">v{state?.appVersion ?? "…"}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className={`badge ${online ? "ok" : "warn"}`}>
            {online ? "Online" : "Offline"}
          </span>
          {account ? (
            <>
              <span className="badge">
                Connecté: <b style={{ color: "var(--text)" }}>{account.name}</b>
              </span>
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() =>
                  run("Déconnexion", async () => {
                    await window.aurora.logout();
                    await refresh();
                  })
                }
              >
                Se déconnecter
              </button>
            </>
          ) : (
            <button
              disabled={!!busy}
              onClick={() =>
                run("Connexion", async () => {
                  await window.aurora.login();
                  await refresh();
                })
              }
            >
              {online ? (authUiMode === "demo" ? "Se connecter (UI démo)" : "Se connecter (Microsoft)") : "Valider pseudo"}
            </button>
          )}
        </div>
      </div>

      {authUiMode === "demo" ? (
        <div className="card" style={{ borderColor: "rgba(255, 255, 255, 0.18)" }}>
          <h2>Mode démo</h2>
          <div className="muted">
            L’UI de connexion est disponible, mais l’auth Microsoft réelle nécessite un <code>Client ID</code> Azure.
            Renseigne-le dans <code>Paramètres</code> (champ <code>msClientId</code>) ou via{" "}
            <code>AURORA_MS_CLIENT_ID</code> (voir <code>docs/AZURE_OAUTH.md</code>). Le bouton <code>Jouer</code>{" "}
            restera bloqué en mode démo.
          </div>
        </div>
      ) : null}

      {maintenance?.enabled ? (
        <div className="card" style={{ borderColor: "rgba(255,106,122,0.6)" }}>
          <h2>Maintenance</h2>
          <div className="muted">{maintenance.message ?? "Le launcher est en maintenance."}</div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ borderColor: "rgba(255,106,122,0.6)" }}>
          <h2>Erreur</h2>
          <pre>{error}</pre>
        </div>
      ) : null}

      <div className="row">
        <div className="card" style={{ flex: "1 1 420px" }}>
          <h2>Profils</h2>
          <div className="muted" style={{ marginBottom: 10 }}>
            Instance isolée par profil (dossier .minecraft dédié).
          </div>

          <label>Mode</label>
          <div className="row" style={{ alignItems: "center" }}>
            <button
              className={online ? "" : "secondary"}
              disabled={!!busy}
              onClick={() =>
                run("Mode online", async () => {
                  if (!state) return;
                  const next = structuredClone(state.config);
                  next.online = true;
                  await window.aurora.saveConfig(next);
                  await refresh();
                })
              }
            >
              Online (Microsoft)
            </button>
            <button
              className={!online ? "" : "secondary"}
              disabled={!!busy}
              onClick={() =>
                run("Mode offline", async () => {
                  if (!state) return;
                  const next = structuredClone(state.config);
                  next.online = false;
                  await window.aurora.saveConfig(next);
                  await refresh();
                })
              }
            >
              Offline (pseudo)
            </button>
          </div>

          {!online ? (
            <>
              <label>Pseudo offline</label>
              <input value={offlineName} onChange={(e) => setOfflineName(e.target.value)} />
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() =>
                    run("Pseudo offline", async () => {
                      await window.aurora.setOfflineName(offlineName);
                      await refresh();
                    })
                  }
                >
                  Enregistrer pseudo
                </button>
              </div>
            </>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() =>
                run("Créer profil", async () => {
                  await window.aurora.createProfile({});
                  await refresh();
                })
              }
            >
              + Nouveau profil
            </button>
            <button
              disabled={!!busy || !selectedProfile || (online && authUiMode === "demo")}
              onClick={() =>
                run("Lancer", async () => {
                  if (!state?.config?.selectedProfileId) throw new Error("Aucun profil sélectionné");
                  await window.aurora.play(state.config.selectedProfileId);
                })
              }
            >
              Jouer
            </button>
          </div>

          <label>Profil sélectionné</label>
          <select
            value={state?.config?.selectedProfileId ?? ""}
            onChange={(e) =>
              run("Sélection", async () => {
                await window.aurora.selectProfile(e.target.value);
                await refresh();
              })
            }
          >
            <option value="" disabled>
              —
            </option>
            {(state?.config?.profiles ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.gameVersion} ({p.loader?.type})
              </option>
            ))}
          </select>

          {selectedProfile ? (
            <>
              <label>Version Minecraft</label>
              <select
                value={selectedProfile.gameVersion ?? ""}
                onChange={(e) => {
                  setState((s) => {
                    if (!s) return s;
                    const next = structuredClone(s);
                    const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                    next.config.profiles[idx].gameVersion = e.target.value;
                    next.config.profiles[idx].resolvedVersionId = undefined;
                    return next;
                  });
                }}
              >
                <option value="" disabled>
                  {mcVersions.length ? "Sélectionner une version" : "Chargement…"}
                </option>
                {mcVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              {!mcVersions.length ? <div className="muted">Liste des versions indisponible.</div> : null}

              <label>Loader</label>
              <select
                value={selectedProfile.loader?.type ?? "vanilla"}
                onChange={(e) => {
                  const t = e.target.value;
                  const defaultFabric = fabricLoaders[0] ?? "0.16.10";
                  const defaultLegacyFabric = legacyFabricLoaders[0] ?? "0.16.10";
                  const defaultQuilt = quiltLoaders[0] ?? "0.28.0";
                  const defaultForge = filteredForgeVersions[0] ?? "47.3.0";
                  const defaultNeoForge = neoForgeVersions[0] ?? "20.6.120";
                  setState((s) => {
                    if (!s) return s;
                    const next = structuredClone(s);
                    const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                    next.config.profiles[idx].resolvedVersionId = undefined;
                    if (t === "vanilla") next.config.profiles[idx].loader = { type: "vanilla" };
                    if (t === "fabric") next.config.profiles[idx].loader = { type: "fabric", loaderVersion: defaultFabric };
                    if (t === "legacyfabric")
                      next.config.profiles[idx].loader = { type: "legacyfabric", loaderVersion: defaultLegacyFabric };
                    if (t === "quilt") next.config.profiles[idx].loader = { type: "quilt", loaderVersion: defaultQuilt };
                    if (t === "forge") next.config.profiles[idx].loader = { type: "forge", forgeVersion: defaultForge };
                    if (t === "neoforge")
                      next.config.profiles[idx].loader = { type: "neoforge", neoForgeVersion: defaultNeoForge };
                    return next;
                  });
                }}
              >
                <option value="vanilla">Vanilla</option>
                <option value="forge">Forge</option>
                <option value="neoforge">NeoForge</option>
                <option value="fabric">Fabric</option>
                <option value="legacyfabric">LegacyFabric</option>
                <option value="quilt">Quilt</option>
              </select>

              {"loaderVersion" in (selectedProfile.loader ?? {}) ? (
                <>
                  <label>Loader version</label>
                  <select
                    value={selectedProfile.loader.loaderVersion ?? ""}
                    onChange={(e) => {
                      setState((s) => {
                        if (!s) return s;
                        const next = structuredClone(s);
                        const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                        next.config.profiles[idx].loader.loaderVersion = e.target.value;
                        next.config.profiles[idx].resolvedVersionId = undefined;
                        return next;
                      });
                    }}
                    disabled={
                      (selectedProfile.loader.type === "fabric" && fabricLoaders.length === 0) ||
                      (selectedProfile.loader.type === "legacyfabric" && legacyFabricLoaders.length === 0) ||
                      (selectedProfile.loader.type === "quilt" && quiltLoaders.length === 0)
                    }
                  >
                    <option value="" disabled>
                      Sélectionner une version
                    </option>
                    {(selectedProfile.loader.type === "fabric" ? fabricLoaders
                      : selectedProfile.loader.type === "legacyfabric" ? legacyFabricLoaders
                      : quiltLoaders
                    ).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {selectedProfile.loader.type === "fabric" && !fabricLoaders.length ? (
                    <div className="muted">Liste Fabric indisponible.</div>
                  ) : null}
                  {selectedProfile.loader.type === "legacyfabric" && !legacyFabricLoaders.length ? (
                    <div className="muted">Liste LegacyFabric indisponible.</div>
                  ) : null}
                  {selectedProfile.loader.type === "quilt" && !quiltLoaders.length ? (
                    <div className="muted">Liste Quilt indisponible.</div>
                  ) : null}
                </>
              ) : null}

              {"forgeVersion" in (selectedProfile.loader ?? {}) ? (
                <>
                  <label>Forge version</label>
                  <select
                    value={selectedProfile.loader.forgeVersion ?? ""}
                    onChange={(e) => {
                      setState((s) => {
                        if (!s) return s;
                        const next = structuredClone(s);
                        const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                        next.config.profiles[idx].loader.forgeVersion = e.target.value;
                        next.config.profiles[idx].resolvedVersionId = undefined;
                        return next;
                      });
                    }}
                    disabled={!filteredForgeVersions.length}
                  >
                    <option value="" disabled>
                      Sélectionner une version
                    </option>
                    {filteredForgeVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {!filteredForgeVersions.length ? (
                    <div className="muted">Liste Forge indisponible pour cette version.</div>
                  ) : null}
                </>
              ) : null}

              {"neoForgeVersion" in (selectedProfile.loader ?? {}) ? (
                <>
                  <label>NeoForge version</label>
                  <select
                    value={selectedProfile.loader.neoForgeVersion ?? ""}
                    onChange={(e) => {
                      setState((s) => {
                        if (!s) return s;
                        const next = structuredClone(s);
                        const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                        next.config.profiles[idx].loader.neoForgeVersion = e.target.value;
                        next.config.profiles[idx].resolvedVersionId = undefined;
                        return next;
                      });
                    }}
                    disabled={!neoForgeVersions.length}
                  >
                    <option value="" disabled>
                      Sélectionner une version
                    </option>
                    {neoForgeVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {!neoForgeVersions.length ? <div className="muted">Liste NeoForge indisponible.</div> : null}
                </>
              ) : null}

              <label>RAM (MiB)</label>
              <div className="row">
                <div style={{ flex: "1 1 180px" }}>
                  <label>Min</label>
                  <input
                    type="number"
                    value={selectedProfile.java?.minRamMiB ?? 2048}
                    onChange={(e) => {
                      setState((s) => {
                        if (!s) return s;
                        const next = structuredClone(s);
                        const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                        next.config.profiles[idx].java.minRamMiB = Number(e.target.value);
                        return next;
                      });
                    }}
                  />
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <label>Max</label>
                  <input
                    type="number"
                    value={selectedProfile.java?.maxRamMiB ?? 4096}
                    onChange={(e) => {
                      setState((s) => {
                        if (!s) return s;
                        const next = structuredClone(s);
                        const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                        next.config.profiles[idx].java.maxRamMiB = Number(e.target.value);
                        return next;
                      });
                    }}
                  />
                </div>
              </div>

              <label>Arguments JVM (1 par ligne)</label>
              <textarea
                rows={4}
                value={(selectedProfile.java?.jvmArgs ?? []).join("\n")}
                onChange={(e) => {
                  setState((s) => {
                    if (!s) return s;
                    const next = structuredClone(s);
                    const idx = next.config.profiles.findIndex((p: any) => p.id === selectedProfile.id);
                    next.config.profiles[idx].java.jvmArgs = e.target.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean);
                    return next;
                  });
                }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  className="secondary"
                  disabled={!!busy || !state}
                  onClick={() =>
                    run("Enregistrer", async () => {
                      await window.aurora.saveConfig(state!.config);
                      await refresh();
                    })
                  }
                >
                  Enregistrer paramètres
                </button>
                <div className="muted" style={{ alignSelf: "center" }}>
                  {selectedProfile.resolvedVersionId ? `Installé: ${selectedProfile.resolvedVersionId}` : "Non installé"}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="card" style={{ flex: "1 1 420px" }}>
          <h2>Statut serveur</h2>
          {state?.config?.servers?.length ? (
            <>
              <div className="muted" style={{ marginBottom: 10 }}>
                {state.config.servers[0].name} — {state.config.servers[0].host}:{state.config.servers[0].port}
              </div>
              {serverStatus?.online ? (
                <div>
                  <div>
                    En ligne — {serverStatus.players?.online ?? "?"}/{serverStatus.players?.max ?? "?"} joueurs
                  </div>
                  <div className="muted">{serverStatus.motd}</div>
                  <div className="muted">Latence: {serverStatus.latencyMs}ms</div>
                </div>
              ) : (
                <div className="muted">Hors ligne ({serverStatus?.error ?? "…"})</div>
              )}
            </>
          ) : (
            <div className="muted">
              Ajoutez un serveur dans la config (champ <code>servers</code>).
            </div>
          )}

          <label>Remote config URL</label>
          <input
            value={state?.config?.remoteConfigUrl ?? ""}
            placeholder="https://exemple.com/launcher.json"
            onChange={(e) => {
              setState((s) => {
                if (!s) return s;
                const next = structuredClone(s);
                next.config.remoteConfigUrl = e.target.value.trim() || undefined;
                return next;
              });
            }}
          />

          <label>Microsoft Client ID (msClientId)</label>
          <input
            value={state?.config?.msClientId ?? ""}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={(e) => {
              setState((s) => {
                if (!s) return s;
                const next = structuredClone(s);
                next.config.msClientId = e.target.value.trim() || undefined;
                return next;
              });
            }}
          />
          {online && authUiMode === "demo" ? (
            <div className="alert warn">
              Client ID manquant: la connexion Microsoft reste en mode démo.
            </div>
          ) : null}
          <label>CurseForge API Key</label>
          <input
            value={state?.config?.curseforgeApiKey ?? ""}
            placeholder="clé API CurseForge (pour rechercher des plugins)"
            onChange={(e) => {
              setState((s) => {
                if (!s) return s;
                const next = structuredClone(s);
                next.config.curseforgeApiKey = e.target.value.trim() || undefined;
                return next;
              });
            }}
          />
          {!hasCurseforgeKey ? (
            <div className="alert warn">
              Clé CurseForge manquante: la recherche et l'installation depuis le store seront bloquées.
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              className="secondary"
              disabled={!!busy || !state}
              onClick={() =>
                run("Enregistrer", async () => {
                  await window.aurora.saveConfig(state!.config);
                  await refresh();
                })
              }
            >
              Enregistrer
            </button>
            <button className="secondary" disabled={!!busy} onClick={() => run("Rafraîchir", refresh)}>
              Rafraîchir
            </button>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: "1 1 980px", padding: 0 }}>
          <div className="server-shell">
            <aside className="server-sidebar">
              <div className="server-mini-card">
                <div className="muted">Serveur géré</div>
                <select value={managedSelectedId} onChange={(e) => setManagedSelectedId(e.target.value)}>
                  <option value="">—</option>
                  {managedServers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.gameVersion}
                    </option>
                  ))}
                </select>
                <div className="sidebar-state">
                  <span className={`dot ${managedStatus?.running ? "ok" : "warn"}`} />
                  {managedStatus?.running ? "En ligne" : "Hors ligne"}
                </div>
                <div className="sidebar-actions">
                  <button
                    disabled={!!busy || !managedSelectedId || managedStatus?.running}
                    onClick={() =>
                      run("Démarrer", async () => {
                        await window.aurora.managedServerStart(managedSelectedId);
                        const status = await window.aurora.managedServerStatus(managedSelectedId);
                        setManagedStatus(status);
                      })
                    }
                  >
                    Démarrer
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy || !managedSelectedId || !managedStatus?.running}
                    onClick={() =>
                      run("Redémarrer", async () => {
                        await window.aurora.managedServerStop(managedSelectedId);
                        await new Promise((r) => setTimeout(r, 1500));
                        await window.aurora.managedServerStart(managedSelectedId);
                      })
                    }
                  >
                    Redémarrer
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy || !managedSelectedId || !managedStatus?.running}
                    onClick={() =>
                      run("Arrêter", async () => {
                        await window.aurora.managedServerStop(managedSelectedId);
                        const status = await window.aurora.managedServerStatus(managedSelectedId);
                        setManagedStatus(status);
                      })
                    }
                  >
                    Arrêter
                  </button>
                </div>
                <div className="sidebar-info">
                  <div className="label">IP:Port</div>
                  <div className="muted">
                    127.0.0.1:{managedProps?.["server-port"] ?? managedStatus?.ping?.port ?? newServerPort}
                  </div>
                  <button
                    className="secondary small"
                    disabled={!!busy || !managedSelectedId}
                    onClick={() => window.aurora.managedServerOpenDir(managedSelectedId)}
                  >
                    Ouvrir dossier
                  </button>
                  {managedStatus?.acceptedEula ? null : (
                    <button
                      className="secondary small"
                      disabled={!!busy || !managedSelectedId}
                      onClick={() =>
                        run("Accepter EULA", async () => {
                          await window.aurora.managedServerEula(managedSelectedId, true);
                          const status = await window.aurora.managedServerStatus(managedSelectedId);
                          setManagedStatus(status);
                        })
                      }
                    >
                      Accepter EULA
                    </button>
                  )}
                </div>
                <div className="sidebar-section">
                  <div className="label">Nouvel espace</div>
                  <label>Nom</label>
                  <input
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    placeholder="Mon serveur"
                  />
                  <label>Version</label>
                  <select value={newServerVersion} onChange={(e) => setNewServerVersion(e.target.value)}>
                    <option value="" disabled>
                      {mcVersions.length ? "Sélectionner une version" : "Chargement…"}
                    </option>
                    {mcVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {!mcVersions.length ? <div className="muted">Liste des versions indisponible.</div> : null}
                  <label>Port</label>
                  <input
                    type="number"
                    value={newServerPort}
                    onChange={(e) => setNewServerPort(Number(e.target.value))}
                    placeholder="25565"
                  />
                  <button
                    className="secondary"
                    disabled={!!busy || (mcVersions.length > 0 && !newServerVersion)}
                    onClick={() =>
                      run("Créer serveur", async () => {
                        await window.aurora.managedServersCreate({
                          name: newServerName,
                          gameVersion: newServerVersion,
                          port: newServerPort
                        });
                        await refresh();
                      })
                    }
                  >
                    + Créer & installer
                  </button>
                </div>
                <div className="server-nav">
                  {[
                    { id: "versions", label: "Versions" },
                    { id: "players", label: "Joueurs" },
                    { id: "params", label: "Paramètres" },
                    { id: "console", label: "Console / Logs" }
                  ].map((item) => (
                    <div
                      key={item.id}
                      className={`nav-item ${serverTab === item.id ? "active" : ""}`}
                      onClick={() => setServerTab(item.id)}
                    >
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <div className="server-main">
              <div className="server-banner">
                <div className="info-card">
                  <div className="label">Adresse</div>
                  <div className="info-value">
                    127.0.0.1:{managedProps?.["server-port"] ?? managedStatus?.ping?.port ?? newServerPort}
                  </div>
                </div>
                <div className="info-card">
                  <div className="label">Statut</div>
                  <div className="info-value">{managedStatus?.running ? "En ligne" : "Hors ligne"}</div>
                </div>
                <div className="info-card">
                  <div className="label">Joueurs</div>
                  <div className="info-value">
                    {managedStatus?.ping?.players?.online ?? 0}/{managedStatus?.ping?.players?.max ?? "?"}
                  </div>
                </div>
                <div className="info-card">
                  <div className="label">Latence</div>
                  <div className="info-value">{managedStatus?.ping?.latencyMs ?? "—"} ms</div>
                </div>
              </div>

              {!managedSelectedId ? (
                <div className="placeholder">
                  <div className="muted">Sélectionne un serveur ou crée-en un pour afficher la console.</div>
                </div>
              ) : (
                (() => {
                  if (!managedStatus?.running && !["versions", "console", "params"].includes(serverTab)) {
                    return <div className="alert warn">Le serveur doit être en ligne pour afficher cette section.</div>;
                  }
                  switch (serverTab) {
                    case "players":
                      return (
                        <div className="panel">
                            <div className="panel-header">
                              <div className="server-tab-title">Joueurs</div>
                              <div className="muted">Gérez opérateurs, whitelist, bannis.</div>
                            </div>
                            {!managedStatus?.running ? (
                              <div className="alert error">Le serveur doit être en ligne pour afficher la liste des joueurs.</div>
                            ) : null}
                            {playerNotice ? (
                              <div className={`notice ${playerNotice.type}`}>{playerNotice.message}</div>
                            ) : null}
                          <div className="tabs">
                            <span className="pill">Connectés</span>
                          </div>
                          <div className="row" style={{ alignItems: "center" }}>
                            <input
                              value={playerReason}
                              placeholder="Raison (kick/ban)"
                              onChange={(e) => setPlayerReason(e.target.value)}
                            />
                          </div>
                          <div className="player-list">
                            {(managedStatus?.players ?? []).length ? (
                              managedStatus.players.map((name: string) => (
                                <div key={name} className="player-row">
                                  <div>
                                    <div className="player-name">{name}</div>
                                    <div className="muted">Connecté</div>
                                  </div>
                                  <div className="player-actions">
                                    <button
                                      className="secondary small"
                                      disabled={!!playerActionBusy}
                                      onClick={() =>
                                        run("Commande", async () => {
                                          setPlayerActionBusy(name);
                                          try {
                                            const reason = playerReason.trim();
                                            await window.aurora.managedServerCommand(
                                              managedSelectedId,
                                              reason ? `kick ${name} ${reason}` : `kick ${name}`
                                            );
                                            setPlayerNotice({
                                              type: "ok",
                                              message: `Kick envoyé à ${name}${reason ? ` — ${reason}` : ""}`
                                            });
                                          } finally {
                                            setPlayerActionBusy(null);
                                          }
                                        })
                                      }
                                    >
                                      Kick
                                    </button>
                                    <button
                                      className="secondary small"
                                      disabled={!!playerActionBusy}
                                      onClick={() =>
                                        run("Commande", async () => {
                                          setPlayerActionBusy(name);
                                          try {
                                            const reason = playerReason.trim();
                                            await window.aurora.managedServerCommand(
                                              managedSelectedId,
                                              reason ? `ban ${name} ${reason}` : `ban ${name}`
                                            );
                                            setPlayerNotice({
                                              type: "ok",
                                              message: `Ban envoyé à ${name}${reason ? ` — ${reason}` : ""}`
                                            });
                                          } finally {
                                            setPlayerActionBusy(null);
                                          }
                                        })
                                      }
                                    >
                                      Bannir
                                    </button>
                                    <button
                                      className="secondary small"
                                      disabled={!!playerActionBusy}
                                      onClick={() =>
                                        run("Commande", async () => {
                                          setPlayerActionBusy(name);
                                          try {
                                            await window.aurora.managedServerCommand(managedSelectedId, `op ${name}`);
                                            setPlayerNotice({ type: "ok", message: `OP donné à ${name}` });
                                          } finally {
                                            setPlayerActionBusy(null);
                                          }
                                        })
                                      }
                                    >
                                      OP
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="muted">Aucun joueur connecté.</div>
                            )}
                          </div>
                        </div>
                      );
                    case "versions":
                      return (
                        <div className="panel">
                          <div className="panel-header">
                            <div className="server-tab-title">Versions</div>
                            <div className="muted">Changer de version ou installer un loader.</div>
                          </div>
                          {mcVersions.length && selectedServer?.gameVersion && mcVersions[0] !== selectedServer.gameVersion ? (
                            <div className="alert warn">
                              Une mise à jour est disponible ({selectedServer.gameVersion} → {mcVersions[0]}). Risque : mods/plugins
                              incompatibles, monde potentiellement non réversible. Sauvegarde conseillée.
                              <div style={{ marginTop: 8 }}>
                                <button
                                  className="secondary small"
                                  disabled={!!busy}
                                  onClick={() =>
                                    run("Mettre à jour", async () => {
                                      await window.aurora.managedServerSetVersion(
                                        managedSelectedId,
                                        mcVersions[0],
                                        selectedServer.serverLoader ?? "vanilla"
                                      );
                                      const res = await window.aurora.managedServerStatus(managedSelectedId);
                                      setManagedStatus(res);
                                    })
                                  }
                                >
                                  Mettre à jour
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <label>Version du serveur</label>
                          <select
                            value={serverVersionChoice}
                            onChange={(e) => setServerVersionChoice(e.target.value)}
                          >
                            <option value="" disabled>
                              {mcVersions.length ? "Sélectionner une version" : "Chargement…"}
                            </option>
                            {mcVersions.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                          {!serverVersionChoice ? (
                            <div className="muted">Sélectionne une version pour activer les actions.</div>
                          ) : null}
                          <div className="version-grid">
                            <div className="version-card">
                              <div>Jouer simplement</div>
                              <button
                                className="secondary small"
                                disabled={!!busy || !serverVersionChoice}
                                onClick={() =>
                                  run("Set version", async () => {
                                    await window.aurora.managedServerSetVersion(managedSelectedId, serverVersionChoice, "vanilla");
                                    const res = await window.aurora.managedServerStatus(managedSelectedId);
                                    setManagedStatus(res);
                                  })
                                }
                              >
                                Vanilla
                              </button>
                            </div>
                            <div className="version-card">
                              <div>Avec plugins</div>
                              <button
                                className="secondary small"
                                disabled={!!busy || !serverVersionChoice}
                                onClick={() =>
                                  run("Paper", async () => {
                                    await window.aurora.managedServerSetVersion(managedSelectedId, serverVersionChoice, "paper");
                                    const res = await window.aurora.managedServerStatus(managedSelectedId);
                                    setManagedStatus(res);
                                  })
                                }
                              >
                                Paper
                              </button>
                              <button
                                className="secondary small"
                                disabled={!!busy || !serverVersionChoice}
                                onClick={() =>
                                  run("Spigot (Paper)", async () => {
                                    await window.aurora.managedServerSetVersion(managedSelectedId, serverVersionChoice, "paper");
                                    const res = await window.aurora.managedServerStatus(managedSelectedId);
                                    setManagedStatus(res);
                                  })
                                }
                              >
                                Spigot
                              </button>
                            </div>
                            <div className="version-card">
                              <div>Avec mods</div>
                              {[
                                { label: "Forge", loader: "forge" },
                                { label: "NeoForge", loader: "neoforge" },
                                { label: "Fabric", loader: "fabric" },
                                { label: "Arclight", loader: "arclight" }
                              ].map((item) => (
                                <button
                                  key={item.loader}
                                  className="secondary small"
                                  disabled={!!busy || !serverVersionChoice}
                                  onClick={() =>
                                    run(item.label, async () => {
                                      await window.aurora.managedServerSetVersion(managedSelectedId, serverVersionChoice, item.loader);
                                      const res = await window.aurora.managedServerStatus(managedSelectedId);
                                      setManagedStatus(res);
                                    })
                                  }
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                            <div className="version-card">
                              <div>Plugins + mods</div>
                              <button
                                className="secondary small"
                                disabled={!!busy || !serverVersionChoice}
                                onClick={() =>
                                  run("Arclight", async () => {
                                    await window.aurora.managedServerSetVersion(managedSelectedId, serverVersionChoice, "arclight");
                                    const res = await window.aurora.managedServerStatus(managedSelectedId);
                                    setManagedStatus(res);
                                  })
                                }
                              >
                                Arclight
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    case "params":
                      return (
                        <div className="panel">
                          <div className="panel-header">
                            <div className="server-tab-title">Paramètres</div>
                            <div className="muted">Tous les réglages de server.properties.</div>
                          </div>
                          {!managedProps ? (
                            <div className="alert warn">Démarre le serveur une fois pour générer server.properties.</div>
                          ) : (
                            <>
                              <div className="settings-section">
                                <div className="settings-section-title">Réglages rapides</div>
                                <div className="muted">Les options les plus utilisées pour démarrer.</div>
                                <div className="settings-grid">
                                  {quickServerSettings.map((item) => {
                                    const rawValue = String(managedProps?.[item.key] ?? "");
                                    const normalizedBool = rawValue.toLowerCase() === "true" ? "true" : "false";
                                    const updateValue = (value: string) =>
                                      setManagedProps((p) => ({ ...(p ?? {}), [item.key]: value }));
                                    return (
                                      <div key={item.key} className="setting-row">
                                        <label>{item.label}</label>
                                        {item.type === "select" ? (
                                          <select
                                            value={rawValue}
                                            onChange={(e) => updateValue(e.target.value)}
                                          >
                                            {(item.options ?? []).map((option) => (
                                              <option key={option} value={option}>
                                                {option}
                                              </option>
                                            ))}
                                          </select>
                                        ) : item.type === "boolean" ? (
                                          <select
                                            value={normalizedBool}
                                            onChange={(e) => updateValue(e.target.value)}
                                          >
                                            <option value="true">true</option>
                                            <option value="false">false</option>
                                          </select>
                                        ) : (
                                          <input
                                            type={item.type === "number" ? "number" : "text"}
                                            value={rawValue}
                                            onChange={(e) => updateValue(e.target.value)}
                                          />
                                        )}
                                        {item.hint ? <div className="setting-help">{item.hint}</div> : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="settings-section">
                                <div className="settings-section-title">Tous les paramètres</div>
                                <div className="row" style={{ alignItems: "center" }}>
                                  <input
                                    value={settingsFilter}
                                    placeholder="Filtrer un paramètre (ex: max-players)"
                                    onChange={(e) => setSettingsFilter(e.target.value)}
                                  />
                                  <button
                                    className="secondary"
                                    disabled={!!busy}
                                    onClick={() =>
                                      run("Enregistrer properties", async () => {
                                        await window.aurora.managedServerPropertiesSet(managedSelectedId, managedProps);
                                      })
                                    }
                                  >
                                    Enregistrer
                                  </button>
                                  <button
                                    className="secondary"
                                    disabled={!!busy}
                                    onClick={() =>
                                      run("Recharger properties", async () => {
                                        const res = await window.aurora.managedServerPropertiesGet(managedSelectedId);
                                        setManagedProps(res?.properties ?? null);
                                      })
                                    }
                                  >
                                    Recharger
                                  </button>
                                </div>
                                <div className="settings-grid">
                                  {Object.entries(managedProps)
                                    .filter(([k]) =>
                                      settingsFilter ? k.toLowerCase().includes(settingsFilter.toLowerCase()) : true
                                    )
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([key, value]) => (
                                      <div key={key} className="setting-row">
                                        <label>{key}</label>
                                        <input
                                          value={String(value ?? "")}
                                          onChange={(e) =>
                                            setManagedProps((p) => ({ ...(p ?? {}), [key]: e.target.value }))
                                          }
                                        />
                                      </div>
                                    ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    case "console":
                    default:
                      return managedStatus?.running ? (
                        <>
                          <div className="console-card">
                            <div className="console-header">
                              <div className="label">Console</div>
                              <button
                                className="secondary small"
                                disabled={!!busy}
                                onClick={() => {
                                  const text = managedStatus?.log ?? "";
                                  navigator.clipboard?.writeText(text).catch(() => {});
                                }}
                              >
                                Copier les logs
                              </button>
                            </div>
                            <div className="console-body" ref={consoleBodyRef}>
                              <div className="log-lines">
                                {(managedStatus.log ?? "")
                                  .split("\n")
                                  .filter(Boolean)
                                  .map((line: string, idx: number) => {
                                    const clean = stripAnsi(line);
                                    return (
                                      <div key={idx} className={`log-line ${logClass(clean)}`}>
                                        {clean}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                            <div className="console-input">
                              <input
                                value={managedCommand}
                                placeholder="help, list, say ..."
                                onChange={(e) => setManagedCommand(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    run("Commande", async () => {
                                      await window.aurora.managedServerCommand(managedSelectedId, managedCommand);
                                      setManagedCommand("");
                                    });
                                  }
                                }}
                              />
                              <button
                                disabled={!!busy}
                                onClick={() =>
                                  run("Commande", async () => {
                                    await window.aurora.managedServerCommand(managedSelectedId, managedCommand);
                                    setManagedCommand("");
                                  })
                                }
                              >
                                Envoyer
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="placeholder">
                          <div className="placeholder-card">
                            <div className="muted">Serveur hors ligne</div>
                            <div>Démarre le serveur pour afficher la console et les logs.</div>
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                run("Démarrer", async () => {
                                  await window.aurora.managedServerStart(managedSelectedId);
                                  const status = await window.aurora.managedServerStatus(managedSelectedId);
                                  setManagedStatus(status);
                                })
                              }
                            >
                              Démarrer le serveur
                            </button>
                          </div>
                        </div>
                      );
                  }
                })()
              )}
            </div>
        </div>
      </div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: "1 1 980px" }}>
          <h2>Plugins & Store</h2>
          <div className="muted" style={{ marginBottom: 12 }}>
            Installe des extensions côté launcher. CurseForge est supporté via clé API (aucun secret stocké en clair).
          </div>
          <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
            <div className="muted" style={{ flex: "1 1 auto" }}>
              {plugins.length ? `${plugins.length} plugins installés` : "Aucun plugin pour l’instant."}
            </div>
            <button className="secondary" disabled={!!busy} onClick={() => window.aurora.pluginOpenDir()}>
              Ouvrir le dossier plugins
            </button>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, marginBottom: 6 }}>Recherche CurseForge</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Renseigne ta clé dans Paramètres (curseforgeApiKey ou AURORA_CURSEFORGE_API_KEY). Recherche limitée à 20 résultats.
            </div>
            {!hasCurseforgeKey ? (
              <div className="alert warn">Clé manquante: ajoute-la pour activer la recherche CurseForge.</div>
            ) : null}
            <div className="row" style={{ alignItems: "center", gap: 10 }}>
              <input
                value={curseQuery}
                placeholder="Rechercher un mod/plugin (ex: sodium, minimap)"
                onChange={(e) => setCurseQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchCurseforge();
                }}
              />
              <button disabled={curseBusy || !hasCurseforgeKey} onClick={() => searchCurseforge()}>
                {curseBusy ? "Recherche..." : "Chercher"}
              </button>
            </div>
            {curseError ? (
              <div className="muted" style={{ color: "#ff9b9b", marginTop: 8 }}>
                {curseError}
              </div>
            ) : null}
            {curseResults.length ? (
              <div className="plugin-grid" style={{ marginTop: 12 }}>
                {curseResults.map((mod: any) => {
                  const latest = (mod.latestFiles ?? [])[0];
                  const installed = plugins.find((p) => p.curseforge?.modId === mod.id);
                  return (
                    <div key={mod.id} className="plugin-card">
                      <div className="plugin-head">
                        <div>
                          <div className="plugin-title">{mod.name}</div>
                          <div className="muted" style={{ maxWidth: 280 }}>{mod.summary}</div>
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
                        {installed ? (
                          <span className="pill">Installé</span>
                        ) : latest ? (
                          <button
                            disabled={!!busy}
                            onClick={() =>
                              run("Installer CurseForge", async () => {
                                const res = await window.aurora.curseforgeDownload({
                                  modId: mod.id,
                                  fileId: latest.id,
                                  fileName: latest.fileName ?? latest.displayName,
                                  downloadUrl: latest.downloadUrl
                                });
                                setPlugins(res);
                              })
                            }
                          >
                            Installer (dernier fichier)
                          </button>
                        ) : (
                          <div className="muted">Aucun fichier disponible</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="plugin-grid">
            {pluginCatalog.map((item) => {
              const installed = pluginsMap.get(item.id);
              const isEnabled = installed?.enabled !== false;
              return (
                <div key={item.id} className="plugin-card">
                  <div className="plugin-head">
                    <div>
                      <div className="plugin-title">{item.name}</div>
                      <div className="muted">v{item.version}</div>
                    </div>
                    <div className="tag-row">
                      {(item.tags ?? []).map((t: string) => (
                        <span key={t} className="pill">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="muted" style={{ margin: "8px 0 12px" }}>
                    {item.description}
                  </div>
                  <div className="row" style={{ alignItems: "center" }}>
                    {installed ? (
                      <>
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() =>
                            run(isEnabled ? "Désactiver plugin" : "Activer plugin", async () => {
                              const res = await window.aurora.pluginToggle(item.id, !isEnabled);
                              setPlugins(res);
                            })
                          }
                        >
                          {isEnabled ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          className="danger"
                          disabled={!!busy}
                          onClick={() =>
                            run("Supprimer plugin", async () => {
                              const res = await window.aurora.pluginRemove(item.id);
                              setPlugins(res);
                            })
                          }
                        >
                          Supprimer
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={!!busy}
                        onClick={() =>
                          run("Installer plugin", async () => {
                            const res = await window.aurora.pluginInstall(item.id);
                            setPlugins(res);
                          })
                        }
                      >
                        Installer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: "1 1 980px" }}>
          <h2>Fil d’actualité</h2>
          {news?.items?.length ? (
            <>
              {news.title ? <div className="muted" style={{ marginBottom: 10 }}>{news.title}</div> : null}
              <div className="row">
                {news.items.slice(0, 6).map((item: any) => (
                  <div key={item.id} className="card" style={{ flex: "1 1 280px" }}>
                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {item.body}
                    </div>
                    {item.url ? (
                      <div className="muted" style={{ marginTop: 10 }}>
                        {item.url}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="muted">Aucune news (config distante non définie ou vide).</div>
          )}
        </div>
      </div>

      {busy ? <div className="muted">En cours: {busy}…</div> : null}
    </div>
  );
}
