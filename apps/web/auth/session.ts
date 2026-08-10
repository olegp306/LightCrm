export const authSessionCookieName = "lightcrm_session";

export const allowedLoginEmails = [
  "gubernatorova.juliya@gmail.com",
  "ekaterina.reyzbikh@gmail.com",
  "olegp306@gmail.com"
] as const;

const accountNames: Record<string, string> = {
  "gubernatorova.juliya@gmail.com": "Юлия",
  "ekaterina.reyzbikh@gmail.com": "Екатерина",
  "olegp306@gmail.com": "Олег"
};

export type AuthSession = {
  email: string;
  issuedAt: number;
  expiresAt: number;
};

type CreateSessionInput = {
  email: string;
  issuedAt?: number;
  expiresAt?: number;
  secret?: string;
};

type ReadSessionOptions = {
  now?: number;
  secret?: string;
};

const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function accountDisplayName(email: string | null | undefined) {
  return accountNames[normalizeEmail(email)] ?? "Не указан";
}

export function accountShortCode(email: string | null | undefined) {
  const name = accountDisplayName(email);
  return name === "Не указан" ? "—" : name.slice(0, 1);
}

export function isAllowedLoginEmail(value: string | null | undefined) {
  const email = normalizeEmail(value);
  return allowedLoginEmails.includes(email as (typeof allowedLoginEmails)[number]);
}

export function getAuthSessionSecret() {
  const secret = process.env.LIGHTCRM_SESSION_SECRET ?? process.env.AUTH_SESSION_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return "lightcrm-local-dev-session-secret";
}

export function authSessionMaxAgeSeconds() {
  return sessionMaxAgeSeconds;
}

export function isValidInternalApiToken(value: string | null | undefined, expected = process.env.LIGHTCRM_INTERNAL_API_TOKEN) {
  const token = expected?.trim();
  if (!token) {
    return false;
  }
  const provided = value?.trim().replace(/^Bearer\s+/i, "");
  return provided === token;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToString(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function signatureFor(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createSessionCookieValue(input: CreateSessionInput) {
  const email = normalizeEmail(input.email);
  if (!isAllowedLoginEmail(email)) {
    throw new Error("Email is not allowed to access LightCRM.");
  }
  const secret = input.secret ?? getAuthSessionSecret();
  if (!secret) {
    throw new Error("LightCRM auth session secret is not configured.");
  }
  const issuedAt = input.issuedAt ?? Date.now();
  const expiresAt = input.expiresAt ?? issuedAt + sessionMaxAgeSeconds * 1000;
  const payload = stringToBase64Url(JSON.stringify({ email, issuedAt, expiresAt } satisfies AuthSession));
  const signature = await signatureFor(payload, secret);
  return `${payload}.${signature}`;
}

export async function readSessionCookieValue(value: string | null | undefined, options: ReadSessionOptions = {}): Promise<AuthSession | null> {
  if (!value) {
    return null;
  }
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }
  const secret = options.secret ?? getAuthSessionSecret();
  if (!secret) {
    return null;
  }
  const expectedSignature = await signatureFor(payload, secret);
  if (!(await constantTimeEqual(signature, expectedSignature))) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlToString(payload)) as Partial<AuthSession>;
    if (!isAllowedLoginEmail(parsed.email) || typeof parsed.issuedAt !== "number" || typeof parsed.expiresAt !== "number") {
      return null;
    }
    if (parsed.expiresAt <= (options.now ?? Date.now())) {
      return null;
    }
    return {
      email: normalizeEmail(parsed.email),
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}
