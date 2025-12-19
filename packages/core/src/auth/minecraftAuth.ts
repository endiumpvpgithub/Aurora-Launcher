/**
 * Chaîne d’auth Microsoft -> Xbox Live -> XSTS -> Minecraft Services.
 *
 * À faire côté application :
 * - Chiffrer le refresh token Microsoft (vault OS / Electron safeStorage).
 * - Rafraîchir automatiquement avant expiration.
 */

export type XboxUserToken = { token: string };
export type XboxXstsToken = { token: string; userHash: string };

export type MinecraftAuthResult = {
  minecraftAccessToken: string;
  expiresIn: number;
  obtainedAt: number;
  profile: {
    id: string;
    name: string;
  };
};

type XboxAuthResponse = { Token: string };
type XstsResponse = {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string }> };
};

export async function authenticateWithXboxLive(
  microsoftAccessToken: string
): Promise<XboxUserToken> {
  const res = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-xbl-contract-version": "1"
    },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${microsoftAccessToken}`
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT"
    })
  });
  if (!res.ok) throw new Error(`XBL auth HTTP ${res.status}`);
  const json = (await res.json()) as XboxAuthResponse;
  return { token: json.Token };
}

export async function authenticateWithXsts(xboxUserToken: string): Promise<XboxXstsToken> {
  const res = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-xbl-contract-version": "1"
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [xboxUserToken]
      },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT"
    })
  });
  if (!res.ok) throw new Error(`XSTS auth HTTP ${res.status}`);
  const json = (await res.json()) as XstsResponse;
  const userHash = json.DisplayClaims.xui?.[0]?.uhs;
  if (!userHash) throw new Error("XSTS: uhs manquant");
  return { token: json.Token, userHash };
}

type MinecraftLoginResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export async function authenticateWithMinecraftServices(
  xsts: XboxXstsToken
): Promise<{ minecraftAccessToken: string; expiresIn: number }> {
  const identityToken = `XBL3.0 x=${xsts.userHash};${xsts.token}`;
  const res = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identityToken })
  });
  if (!res.ok) throw new Error(`MC login HTTP ${res.status}`);
  const json = (await res.json()) as MinecraftLoginResponse;
  return { minecraftAccessToken: json.access_token, expiresIn: json.expires_in };
}

export async function assertMinecraftOwnership(minecraftAccessToken: string): Promise<void> {
  const res = await fetch("https://api.minecraftservices.com/entitlements/mcstore", {
    headers: { authorization: `Bearer ${minecraftAccessToken}` }
  });
  if (!res.ok) throw new Error(`MC entitlements HTTP ${res.status}`);
  const json = (await res.json()) as { items?: unknown[] };
  if (!json.items || json.items.length === 0) {
    throw new Error("Aucune licence Minecraft détectée sur ce compte.");
  }
}

export async function fetchMinecraftProfile(
  minecraftAccessToken: string
): Promise<{ id: string; name: string }> {
  const res = await fetch("https://api.minecraftservices.com/minecraft/profile", {
    headers: { authorization: `Bearer ${minecraftAccessToken}` }
  });
  if (!res.ok) throw new Error(`MC profile HTTP ${res.status}`);
  const json = (await res.json()) as { id: string; name: string };
  return { id: json.id, name: json.name };
}

export async function authenticateMicrosoftToMinecraft(
  microsoftAccessToken: string
): Promise<MinecraftAuthResult> {
  const xbl = await authenticateWithXboxLive(microsoftAccessToken);
  const xsts = await authenticateWithXsts(xbl.token);
  const mc = await authenticateWithMinecraftServices(xsts);
  await assertMinecraftOwnership(mc.minecraftAccessToken);
  const profile = await fetchMinecraftProfile(mc.minecraftAccessToken);

  return {
    minecraftAccessToken: mc.minecraftAccessToken,
    expiresIn: mc.expiresIn,
    obtainedAt: Date.now(),
    profile
  };
}

