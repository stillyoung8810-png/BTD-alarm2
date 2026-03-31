const DEFAULT_SITE_ORIGIN = "https://btd-alarm2.pages.dev";
const DEFAULT_TOSS_APP_NAME = "btdalarm";

/** Vite 기본 dev 서버; localhost vs 127.0.0.1은 브라우저별로 Origin이 달라 둘 다 허용 */
const LOCAL_VITE_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

const unique = (values: string[]): string[] => Array.from(new Set(values));

const normalizeOrigin = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : null;
};

const splitOrigins = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => !!origin);

const getAllowedOrigins = (): string[] => {
  const tossAppName =
    normalizeOrigin(Deno.env.get("TOSS_APP_NAME"))?.replace(/^https?:\/\//, "") ||
    DEFAULT_TOSS_APP_NAME;

  return unique(
    [
      normalizeOrigin(Deno.env.get("ALLOWED_ORIGIN")),
      normalizeOrigin(Deno.env.get("SITE_URL")),
      normalizeOrigin(Deno.env.get("VITE_SITE_URL")),
      DEFAULT_SITE_ORIGIN,
      `https://${tossAppName}.apps.tossmini.com`,
      `https://${tossAppName}.private-apps.tossmini.com`,
      ...LOCAL_VITE_DEV_ORIGINS,
      ...splitOrigins(Deno.env.get("ALLOWED_ORIGINS")),
    ].filter((origin): origin is string => !!origin),
  );
};

interface CorsOptions {
  allowHeaders?: string;
  allowMethods?: string;
}

export const getCorsHeaders = (
  req: Request,
  options?: CorsOptions,
): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = normalizeOrigin(req.headers.get("origin"));
  const allowOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : (allowedOrigins[0] ?? DEFAULT_SITE_ORIGIN);

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      options?.allowHeaders ?? "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": options?.allowMethods ?? "POST, OPTIONS",
    Vary: "Origin",
  };
};

export const getJsonCorsHeaders = (
  req: Request,
  options?: CorsOptions,
): Record<string, string> => ({
  ...getCorsHeaders(req, options),
  "Content-Type": "application/json",
});
