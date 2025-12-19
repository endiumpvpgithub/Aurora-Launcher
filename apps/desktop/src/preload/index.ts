import { contextBridge, ipcRenderer } from "electron";

type AuroraApi = {
  getState(): Promise<any>;
  saveConfig(config: any): Promise<any>;
  login(): Promise<any>;
  logout(): Promise<boolean>;
  setOfflineName(name: string): Promise<any>;
  managedServersCreate(input: { name: string; gameVersion: string; port?: number }): Promise<any>;
  managedServersList(): Promise<any>;
  managedServerStatus(serverId: string): Promise<any>;
  managedServerEula(serverId: string, accepted: boolean): Promise<any>;
  managedServerStart(serverId: string): Promise<any>;
  managedServerStop(serverId: string): Promise<any>;
  managedServerPropertiesGet(serverId: string): Promise<any>;
  managedServerPropertiesSet(serverId: string, patch: Record<string, string>): Promise<any>;
  managedServerCommand(serverId: string, command: string): Promise<any>;
  managedServerOpenDir(serverId: string): Promise<any>;
  managedServerFilesList(serverId: string): Promise<any>;
  managedServerSetVersion(serverId: string, gameVersion: string, loader?: string): Promise<any>;
  pluginStoreList(): Promise<any>;
  pluginsInstalled(): Promise<any>;
  pluginInstall(pluginId: string): Promise<any>;
  pluginToggle(pluginId: string, enabled: boolean): Promise<any>;
  pluginRemove(pluginId: string): Promise<any>;
  pluginOpenDir(): Promise<any>;
  curseforgeSearch(query: string): Promise<any>;
  curseforgeDownload(input: { modId: number; fileId: number; fileName?: string; downloadUrl?: string }): Promise<any>;
  fetchManifest(): Promise<any>;
  ping(host: string, port?: number): Promise<any>;
  createProfile(partial: any): Promise<any>;
  selectProfile(id: string): Promise<any>;
  play(profileId: string): Promise<{ pid: number }>;
};

const api: AuroraApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  login: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  setOfflineName: (name) => ipcRenderer.invoke("auth:offline:setName", name),
  managedServersCreate: (input) => ipcRenderer.invoke("servers:managed:create", input),
  managedServersList: () => ipcRenderer.invoke("servers:managed:list"),
  managedServerStatus: (serverId) => ipcRenderer.invoke("servers:managed:status", serverId),
  managedServerEula: (serverId, accepted) => ipcRenderer.invoke("servers:managed:eula", serverId, accepted),
  managedServerStart: (serverId) => ipcRenderer.invoke("servers:managed:start", serverId),
  managedServerStop: (serverId) => ipcRenderer.invoke("servers:managed:stop", serverId),
  managedServerPropertiesGet: (serverId) => ipcRenderer.invoke("servers:managed:properties:get", serverId),
  managedServerPropertiesSet: (serverId, patch) => ipcRenderer.invoke("servers:managed:properties:set", serverId, patch),
  managedServerCommand: (serverId, command) => ipcRenderer.invoke("servers:managed:command", serverId, command),
  managedServerOpenDir: (serverId) => ipcRenderer.invoke("servers:managed:openDir", serverId),
  managedServerFilesList: (serverId) => ipcRenderer.invoke("servers:managed:files:list", serverId),
  managedServerSetVersion: (serverId, gameVersion, loader) =>
    ipcRenderer.invoke("servers:managed:version:set", serverId, gameVersion, loader),
  pluginStoreList: () => ipcRenderer.invoke("plugins:store:list"),
  pluginsInstalled: () => ipcRenderer.invoke("plugins:installed:list"),
  pluginInstall: (pluginId) => ipcRenderer.invoke("plugins:install", pluginId),
  pluginToggle: (pluginId, enabled) => ipcRenderer.invoke("plugins:toggle", pluginId, enabled),
  pluginRemove: (pluginId) => ipcRenderer.invoke("plugins:remove", pluginId),
  pluginOpenDir: () => ipcRenderer.invoke("plugins:openDir"),
  curseforgeSearch: (query) => ipcRenderer.invoke("curseforge:search", query),
  curseforgeDownload: (input) => ipcRenderer.invoke("curseforge:download", input),
  fetchManifest: () => ipcRenderer.invoke("versions:manifest"),
  ping: (host, port) => ipcRenderer.invoke("server:ping", host, port),
  createProfile: (partial) => ipcRenderer.invoke("profiles:create", partial),
  selectProfile: (id) => ipcRenderer.invoke("profiles:select", id),
  play: (profileId) => ipcRenderer.invoke("play", profileId)
};

contextBridge.exposeInMainWorld("aurora", api);
