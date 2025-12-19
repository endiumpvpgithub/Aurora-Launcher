import crypto from "node:crypto";
import path from "node:path";
import type { AppPaths } from "../paths/appPaths.js";
import type { ConfigStore, LauncherConfig, Profile } from "../config/config.js";

export function createProfileId(): string {
  return crypto.randomUUID();
}

export function getDefaultInstanceDir(paths: AppPaths, profileId: string): string {
  return path.join(paths.dataDir, "instances", profileId);
}

export async function addProfile(store: ConfigStore, profile: Profile): Promise<LauncherConfig> {
  const config = await store.load();
  const next = { ...config, profiles: [...config.profiles, profile] };
  await store.save(next);
  return next;
}

export async function updateProfile(store: ConfigStore, profile: Profile): Promise<LauncherConfig> {
  const config = await store.load();
  const next = {
    ...config,
    profiles: config.profiles.map((p) => (p.id === profile.id ? profile : p))
  };
  await store.save(next);
  return next;
}

export async function removeProfile(store: ConfigStore, id: string): Promise<LauncherConfig> {
  const config = await store.load();
  const next = {
    ...config,
    profiles: config.profiles.filter((p) => p.id !== id),
    selectedProfileId: config.selectedProfileId === id ? undefined : config.selectedProfileId
  };
  await store.save(next);
  return next;
}

export async function selectProfile(store: ConfigStore, id: string): Promise<LauncherConfig> {
  const config = await store.load();
  const next = { ...config, selectedProfileId: id };
  await store.save(next);
  return next;
}

