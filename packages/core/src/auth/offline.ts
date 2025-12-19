import crypto from "node:crypto";

/**
 * UUID offline compatible launcher/offline servers.
 *
 * Mojang offline UUID algorithm: UUIDv3(MD5, "OfflinePlayer:" + name)
 * Here we return a 32-hex string without dashes (same shape as Minecraft Services id).
 */
export function createOfflineUuid(name: string): string {
  const input = Buffer.from(`OfflinePlayer:${name}`, "utf8");
  const hash = crypto.createHash("md5").update(input).digest();

  // Set version to 3 (name-based MD5)
  hash[6] = (hash[6] & 0x0f) | 0x30;
  // Set variant to RFC 4122
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return hash.toString("hex");
}

