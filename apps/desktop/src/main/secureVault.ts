import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SecretsFile = {
  schemaVersion: 1;
  entries: Record<string, string>;
};

function assertEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Chiffrement indisponible sur cet OS (Electron safeStorage). Impossible de stocker des tokens en sécurité."
    );
  }
}

export class SecureVault {
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = path.join(configDir, "secrets.json");
  }

  private async readAll(): Promise<SecretsFile> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as SecretsFile;
      if (parsed?.schemaVersion !== 1 || typeof parsed.entries !== "object") {
        return { schemaVersion: 1, entries: {} };
      }
      return parsed;
    } catch {
      return { schemaVersion: 1, entries: {} };
    }
  }

  private async writeAll(file: SecretsFile) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(file, null, 2), "utf-8");
  }

  async set(key: string, value: string): Promise<void> {
    if (!app.isReady()) throw new Error("App Electron non prête");
    assertEncryptionAvailable();
    const file = await this.readAll();
    const encrypted = safeStorage.encryptString(value).toString("base64");
    file.entries[key] = encrypted;
    await this.writeAll(file);
  }

  async get(key: string): Promise<string | null> {
    if (!app.isReady()) throw new Error("App Electron non prête");
    assertEncryptionAvailable();
    const file = await this.readAll();
    const b64 = file.entries[key];
    if (!b64) return null;
    const decrypted = safeStorage.decryptString(Buffer.from(b64, "base64"));
    return decrypted;
  }

  async delete(key: string): Promise<void> {
    const file = await this.readAll();
    delete file.entries[key];
    await this.writeAll(file);
  }
}

