"use client";

/**
 * Amazon Cognito Hosted UI sign-in (OAuth 2.0 authorization-code flow with PKCE).
 * Configured only when NEXT_PUBLIC_COGNITO_DOMAIN and NEXT_PUBLIC_COGNITO_CLIENT_ID are set
 * (the AWS deployment sets them). Tokens live in sessionStorage for the browser tab only.
 */
import { useSyncExternalStore } from "react";

const DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
const TOKEN_KEY = "w2v_auth_tokens";
const VERIFIER_KEY = "w2v_pkce_verifier";
const RETURN_KEY = "w2v_auth_return";
export const AUTH_EVENT = "w2v-auth-change";

interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}

export interface AuthUser {
  email: string;
  sub: string;
}

export function authConfigured(): boolean {
  return Boolean(DOMAIN && CLIENT_ID);
}

function redirectUri(): string {
  return `${window.location.origin}/auth/callback/`;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function readTokens(): Tokens | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function writeTokens(t: Tokens | null): void {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the user will simply be asked to sign in again
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function decodeClaims(jwt: string): Record<string, unknown> {
  try {
    const payload = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(payload)))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getUser(): AuthUser | null {
  const t = readTokens();
  if (!t || t.expiresAt <= Date.now()) return null;
  const c = decodeClaims(t.idToken);
  return { email: String(c.email ?? c["cognito:username"] ?? "signed-in user"), sub: String(c.sub ?? "") };
}

export async function startLogin(returnTo?: string): Promise<void> {
  if (!authConfigured()) throw new Error("Sign-in is not configured for this deployment.");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(RETURN_KEY, returnTo ?? window.location.pathname + window.location.search + window.location.hash);
  const url = new URL(`https://${DOMAIN}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "openid email profile",
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();
  window.location.assign(url.toString());
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`https://${DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }).toString(),
  });
  if (!res.ok) throw new Error(`Sign-in failed (HTTP ${res.status}).`);
  const j = (await res.json()) as { id_token: string; access_token: string; refresh_token?: string; expires_in: number };
  return {
    idToken: j.id_token,
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? readTokens()?.refreshToken,
    expiresAt: Date.now() + j.expires_in * 1000 - 30_000,
  };
}

/** Completes the redirect: exchanges the code, stores tokens, returns the path to go back to. */
export async function completeLogin(code: string): Promise<string> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Sign-in session expired. Please try again.");
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier });
  writeTokens(tokens);
  sessionStorage.removeItem(VERIFIER_KEY);
  const back = sessionStorage.getItem(RETURN_KEY) || "/dashboard";
  sessionStorage.removeItem(RETURN_KEY);
  return back;
}

/** A currently valid ID token (refreshing it when needed), or null when signed out. */
export async function getIdToken(): Promise<string | null> {
  if (!authConfigured() || typeof window === "undefined") return null;
  const t = readTokens();
  if (!t) return null;
  if (t.expiresAt > Date.now()) return t.idToken;
  if (!t.refreshToken) {
    writeTokens(null);
    return null;
  }
  try {
    const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refreshToken });
    writeTokens(fresh);
    return fresh.idToken;
  } catch {
    writeTokens(null);
    return null;
  }
}

export function signOut(): void {
  writeTokens(null);
  if (!authConfigured()) return;
  const url = new URL(`https://${DOMAIN}/logout`);
  url.search = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: `${window.location.origin}/` }).toString();
  window.location.assign(url.toString());
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(AUTH_EVENT, cb);
  return () => window.removeEventListener(AUTH_EVENT, cb);
}

let cachedKey = "";
let cachedUser: AuthUser | null = null;
function snapshot(): AuthUser | null {
  const raw = (() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  })();
  if (raw !== cachedKey) {
    cachedKey = raw;
    cachedUser = getUser();
  }
  return cachedUser;
}

/** Current signed-in user (null when signed out or auth is not configured). */
export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
