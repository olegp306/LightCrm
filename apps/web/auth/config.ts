export type GoogleLoginConfigEnv = Record<string, string | undefined> & {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LIGHTCRM_SESSION_SECRET?: string;
  AUTH_SESSION_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXTAUTH_URL?: string;
};

export type GoogleLoginConfig = {
  configured: boolean;
  missing: string[];
  callbackUrl: string;
};

type HeaderReader = {
  get(name: string): string | null;
};

export function originFromHeaders(headers: HeaderReader, fallbackOrigin: string) {
  const fallback = new URL(fallbackOrigin);
  const protocol = headers.get("x-forwarded-proto") ?? fallback.protocol.replace(/:$/, "") ?? "http";
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? fallback.host;
  return `${protocol}://${host}`;
}

export function configuredPublicOrigin(env: GoogleLoginConfigEnv = process.env): string | null {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim() || env.NEXTAUTH_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function publicOriginFromRequest(
  headers: HeaderReader,
  fallbackOrigin: string,
  env: GoogleLoginConfigEnv = process.env
) {
  return configuredPublicOrigin(env) ?? originFromHeaders(headers, fallbackOrigin);
}

export function googleLoginConfig(origin: string, env: GoogleLoginConfigEnv = process.env): GoogleLoginConfig {
  const callbackUrl = new URL("/api/auth/google/callback", origin).toString();
  const missing = [
    env.GOOGLE_CLIENT_ID ? null : "GOOGLE_CLIENT_ID",
    env.GOOGLE_CLIENT_SECRET ? null : "GOOGLE_CLIENT_SECRET",
    env.LIGHTCRM_SESSION_SECRET || env.AUTH_SESSION_SECRET ? null : "LIGHTCRM_SESSION_SECRET"
  ].filter((item): item is string => Boolean(item));

  return {
    configured: missing.length === 0,
    missing,
    callbackUrl
  };
}
