import crypto from "node:crypto";
import { URLSearchParams } from "node:url";

export type MicrosoftOAuthTokens = {
  tokenType: "Bearer";
  scope: string;
  expiresIn: number;
  extExpiresIn?: number;
  accessToken: string;
  refreshToken: string;
  obtainedAt: number;
};

export type PkcePair = {
  verifier: string;
  challenge: string;
};

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function createPkcePair(): PkcePair {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export type MicrosoftOAuthConfig = {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  tenant?: "consumers" | "common";
};

const defaultScopes = ["XboxLive.signin", "offline_access"];

export function buildMicrosoftAuthorizeUrl(
  cfg: MicrosoftOAuthConfig,
  pkce: PkcePair,
  state: string
): string {
  const tenant = cfg.tenant ?? "consumers";
  const scopes = cfg.scopes ?? defaultScopes;

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: scopes.join(" "),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256"
  });

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

type MicrosoftTokenResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token: string;
};

export async function exchangeMicrosoftCodeForTokens(
  cfg: MicrosoftOAuthConfig,
  code: string,
  pkceVerifier: string
): Promise<MicrosoftOAuthTokens> {
  const tenant = cfg.tenant ?? "consumers";

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: pkceVerifier
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) throw new Error(`MS token HTTP ${res.status}`);
  const json = (await res.json()) as MicrosoftTokenResponse;

  return {
    tokenType: "Bearer",
    scope: json.scope,
    expiresIn: json.expires_in,
    extExpiresIn: json.ext_expires_in,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    obtainedAt: Date.now()
  };
}

export async function refreshMicrosoftTokens(
  cfg: MicrosoftOAuthConfig,
  refreshToken: string
): Promise<MicrosoftOAuthTokens> {
  const tenant = cfg.tenant ?? "consumers";

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: (cfg.scopes ?? defaultScopes).join(" ")
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error(`MS refresh HTTP ${res.status}`);
  const json = (await res.json()) as MicrosoftTokenResponse;

  return {
    tokenType: "Bearer",
    scope: json.scope,
    expiresIn: json.expires_in,
    extExpiresIn: json.ext_expires_in,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    obtainedAt: Date.now()
  };
}
