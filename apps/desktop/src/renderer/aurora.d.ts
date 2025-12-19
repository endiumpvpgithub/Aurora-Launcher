export {};

declare global {
  interface Window {
    aurora: {
      getState(): Promise<{
        appVersion: string;
        hasMsClientId?: boolean;
        hasCurseforgeKey?: boolean;
        authUiMode?: "real" | "demo";
        config: any;
        remote: any;
      }>;
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
  }
}
