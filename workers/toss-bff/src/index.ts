const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const DEFAULT_TOSS_API_URL = "https://apps-in-toss-api.toss.im";
const DEFAULT_TOSS_IAP_API_URL = "https://api-partner.toss.im";
const TOSS_PAYMENTS_API_URL = "https://api.tosspayments.com";
const TOSS_EMAIL_DOMAIN = "toss.placeholder";
const REQUIRED_TERMS_SEPARATOR = ",";
const LIST_USERS_PAGE_SIZE = 1_000;
const LIST_USERS_MAX_PAGES = 100;
const BASIC_AUTH_PREFIX = "Basic ";
const BEARER_AUTH_PREFIX = "Bearer ";
const AES_GCM_IV_BYTES = 12;
const AES_GCM_AUTH_TAG_BYTES = 16;
const REQUIRED_ENCRYPTION_KEY_CHARS = 32;
const PLAN_DAYS_PER_UNIT = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;
const QUANTITY_MAX = 12;
const DEFAULT_PAYMENT_QUANTITY = 1;
const BASIC_AUTH_SUFFIX = ":";
const DEFAULT_PROMOTION_KEY_TTL_MS = 60 * 60 * 1_000;
const PER_REQUEST_TOSS_POINT_LIMIT = 5_000;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_MULTIPLIER = 2;
const RESULT_SUCCESS = "SUCCESS";
const TOSS_DISCONNECT_REFERRERS = ["UNLINK", "WITHDRAWAL_TERMS", "WITHDRAWAL_TOSS"] as const;
const RESTORABLE_TOSS_ERROR_CODES = new Set(["4100", "4109", "4112", "4114", "4116"]);
const DUPLICATE_KEY_ERROR_CODE = "4113";

interface Env {
  TOSS_MTLS_CERT: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  TOSS_API_URL?: string;
  TOSS_IAP_API_URL?: string;
  TOSS_PAYMENTS_SECRET_KEY?: string;
  TOSS_SECRET_KEY?: string;
  TOSS_LOGIN_USER_SECRET?: string;
  TOSS_REQUIRED_TERMS_TAGS?: string;
  TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET?: string;
  TOSS_WEBHOOK_USER?: string;
  TOSS_WEBHOOK_PASSWORD?: string;
  INTERNAL_ALARM_SECRET?: string;
  BENEFIT_BFF_INTERNAL_SECRET?: string;
  TOSS_SMART_MESSAGE_TEMPLATE_CODE?: string;
  TOSS_SMART_MESSAGE_SCREEN_NAME?: string;
  TOSS_IAP_PRO_PRODUCT_ID?: string;
  TOSS_BENEFIT_PROMOTION_CODE?: string;
  PLAN_AMOUNT_PRO?: string;
  PLAN_AMOUNT_PREMIUM?: string;
  BENEFIT_PROMOTION_RETRY_MAX_ATTEMPTS?: string;
  BENEFIT_PROMOTION_RETRY_INITIAL_DELAY_MS?: string;
  BENEFIT_PROMOTION_RETRY_MAX_DELAY_MS?: string;
  CORS_ORIGIN?: string;
}

interface RequestContext {
  readonly env: Env;
  readonly request: Request;
  readonly url: URL;
  readonly requestId: string;
}

interface ApiErrorBody {
  readonly message?: string;
  readonly msg?: string;
  readonly reason?: string;
  readonly error?: unknown;
  readonly errorCode?: string;
  readonly code?: string;
}

interface NormalizedTossError {
  readonly error: string;
  readonly errorCode?: string;
}

interface TossTokenSuccessDto {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

interface TossLoginMeSuccessDto {
  readonly userKey: number;
  readonly agreedTerms: string[];
  readonly email: string | null;
}

interface TossSessionResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
  };
}

interface SupabaseUser {
  readonly id: string;
  readonly email?: string;
  readonly user_metadata?: Record<string, unknown>;
}

interface SupabaseAuthUserResponse {
  readonly user?: SupabaseUser | null;
}

interface TossAuthLinkRecord {
  readonly tossUserKey: string;
  readonly refreshToken: string;
}

interface EffectiveSubscriptionState {
  readonly tier: SubscriptionTier;
  readonly status: SubscriptionStatus;
  readonly expiresAt: string | null;
  readonly pendingPlan: PaidPlanId | null;
  readonly pendingPlanEffectiveAt: string | null;
  readonly isActive: boolean;
  readonly isExpired: boolean;
  readonly maxPortfolios: number;
  readonly maxAlarms: number;
}

interface SubscriptionUpdateResult {
  readonly nextTier: SubscriptionTier;
  readonly nextStatus: Exclude<SubscriptionStatus, "cancelled" | "refunded">;
  readonly nextExpiresAt: string;
  readonly pendingPlan: PaidPlanId | null;
  readonly pendingPlanEffectiveAt: string | null;
  readonly maxPortfolios: number;
  readonly maxAlarms: number;
  readonly bonusDays: number;
  readonly appliedCase: 1 | 2 | 3 | 4;
}

interface SubscriptionProfileSnapshot {
  readonly id?: string;
  readonly subscription_tier?: string | null;
  readonly subscription_status?: string | null;
  readonly subscription_expires_at?: string | null;
  readonly pending_plan?: string | null;
  readonly pending_plan_effective_at?: string | null;
  readonly max_portfolios?: number | null;
  readonly max_alarms?: number | null;
}

interface OrderProfileRow extends SubscriptionProfileSnapshot {
  readonly id: string;
}

interface FulfillPaidOrderParams {
  readonly paymentId: string;
  readonly userId: string;
  readonly planId: PaidPlanId;
  readonly quantity: number;
  readonly amount: number;
  readonly currency: string;
  readonly payMethod: string;
  readonly pgProvider: string;
  readonly pgTxId?: string | null;
  readonly paidAt?: string | null;
  readonly orderName: string;
  readonly planAmounts: PlanAmounts;
  readonly metadata?: Record<string, unknown>;
  readonly nowIso?: string;
}

interface FulfillPaidOrderResult {
  readonly success: boolean;
  readonly alreadyProcessed?: boolean;
  readonly inProgress?: boolean;
  readonly message?: string;
  readonly subscription?: EffectiveSubscriptionState;
  readonly fulfillment?: SubscriptionUpdateResult;
}

interface ClaimOrderResult {
  readonly success: boolean;
  readonly claimed?: boolean;
  readonly already_processed?: boolean;
  readonly in_progress?: boolean;
  readonly order_id?: string;
  readonly status?: string;
  readonly error?: string;
}

interface OrderStatusUpdate {
  readonly status: "pending" | "paid";
  readonly metadata: Record<string, unknown>;
  readonly paid_at?: string | null;
  readonly pg_tx_id?: string | null;
}

interface PlanAmounts {
  readonly pro: number;
  readonly premium: number;
}

interface TossConfirmResponse {
  readonly status?: string;
  readonly totalAmount?: number | string;
}

interface TossSmartMessageContext {
  readonly date: string;
  readonly screenName: string;
}

interface SendMessageApiResult {
  readonly msgCount?: number;
  readonly sentPushCount?: number;
  readonly sentInboxCount?: number;
  readonly detail?: Record<string, unknown>;
  readonly fail?: Record<string, unknown>;
}

type PaidPlanId = "pro" | "premium";
type SubscriptionTier = "free" | "pro" | "premium" | "enterprise";
type SubscriptionStatus = "active" | "cancelled" | "expired" | "trial" | "refunded" | null;
type BenefitPromotionPayoutStatus = "pending" | "success" | "failed";
type TossDisconnectReferrer = (typeof TOSS_DISCONNECT_REFERRERS)[number];

interface BenefitPromotionExecutionTarget {
  readonly userId: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly promotionCode: string;
  readonly promotionKey: string | null;
  readonly promotionKeyExpiresAt: string | null;
  readonly promotionAttemptCount: number;
  readonly nextPromotionRetryAt: string | null;
  readonly status: BenefitPromotionPayoutStatus;
  readonly tossPointAmount: number;
  readonly redeemedMoney: number;
  readonly moneyBalance: number;
  readonly tossUserKey: string;
}

interface BenefitPromotionRpcResult {
  readonly canExecute?: boolean;
  readonly reason?: string;
  readonly status: BenefitPromotionPayoutStatus;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly promotionCode?: string;
  readonly promotionKey?: string;
  readonly tossPointAmount: number;
  readonly redeemedMoney?: number;
  readonly restoredMoney?: number;
  readonly moneyBalance: number;
  readonly promotionAttemptCount?: number;
  readonly nextPromotionRetryAt?: string | null;
  readonly tossErrorCode?: string | null;
  readonly tossErrorMessage?: string | null;
  readonly completedAt?: string | null;
}

interface ExecuteBenefitPromotionResult {
  readonly success: boolean;
  readonly status: string;
  readonly reason?: string;
  readonly payoutId: string;
  readonly redeemRequestId: string;
  readonly tossPointAmount: number;
  readonly moneyBalance: number;
  readonly nextPromotionRetryAt?: string | null;
  readonly tossErrorCode?: string | null;
  readonly tossErrorMessage?: string | null;
  readonly restoredMoney?: number;
}

class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class TossPromotionRequestError extends Error {
  public readonly errorCode: string;

  public constructor(errorCode: string, message: string) {
    super(message);
    this.name = "TossPromotionRequestError";
    this.errorCode = errorCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName}_must_be_string`);
  }
  return value.trim();
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  return readString(value, fieldName);
}

function readInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName}_must_be_integer`);
  }
  return value as number;
}

function readBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName}_must_be_boolean`);
  }
  return value;
}

function readTrimmedEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function requireEnv(env: Env, key: keyof Env): string {
  const value = readTrimmedEnv(env, key);
  if (value.length === 0) {
    throw new HttpError(500, "MISSING_ENV", `${String(key)} is required`);
  }
  return value;
}

function jsonResponse(ctx: RequestContext, body: unknown, status = 200): Response {
  return withCors(
    ctx,
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": JSON_CONTENT_TYPE },
    }),
  );
}

function emptyResponse(ctx: RequestContext, status = 204): Response {
  return withCors(ctx, new Response(null, { status }));
}

function withCors(ctx: RequestContext, response: Response): Response {
  const headers = new Headers(response.headers);
  const requestOrigin = ctx.request.headers.get("Origin");
  const allowedOrigin = readTrimmedEnv(ctx.env, "CORS_ORIGIN") || requestOrigin || "*";
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,X-Internal-Alarm-Secret,X-Correlation-ID",
  );
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorResponse(ctx: RequestContext, error: unknown): Response {
  if (error instanceof HttpError) {
    console.error(`[${ctx.requestId}] ${error.code}`, error.details ?? error.message);
    return jsonResponse(
      ctx,
      {
        success: false,
        error: error.message,
        errorCode: error.code,
        requestId: ctx.requestId,
      },
      error.status,
    );
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  console.error(`[${ctx.requestId}] unhandled_error`, error);
  return jsonResponse(
    ctx,
    {
      success: false,
      error: message,
      errorCode: "INTERNAL_SERVER_ERROR",
      requestId: ctx.requestId,
    },
    500,
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Invalid JSON body");
  }
}

function basicAuthHeader(username: string, password: string): string {
  return `${BASIC_AUTH_PREFIX}${btoa(`${username}${BASIC_AUTH_SUFFIX}${password}`)}`;
}

function readBearerToken(authHeader: string | null): string {
  if (authHeader == null) {
    return "";
  }
  return authHeader.replace(new RegExp(`^\\s*${BEARER_AUTH_PREFIX}`, "i"), "").trim();
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

function hasValidBasicAuth(authHeader: string | null, username: string, password: string): boolean {
  if (!authHeader?.startsWith(BASIC_AUTH_PREFIX) || username.length === 0 || password.length === 0) {
    return false;
  }

  try {
    const decoded = atob(authHeader.slice(BASIC_AUTH_PREFIX.length).trim());
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return false;
    }

    const actualUser = decoded.slice(0, separatorIndex);
    const actualPassword = decoded.slice(separatorIndex + 1);
    return constantTimeEqual(actualUser, username) && constantTimeEqual(actualPassword, password);
  } catch {
    return false;
  }
}

async function sha256Bytes(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await sha256Bytes(value)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function aesKeyFromSecret(secret: string): Promise<CryptoKey> {
  if (secret.trim().length < REQUIRED_ENCRYPTION_KEY_CHARS) {
    throw new Error("TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET must be at least 32 characters");
  }

  return crypto.subtle.importKey("raw", await sha256Bytes(secret.trim()), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptStoredRefreshToken(refreshToken: string, env: Env): Promise<string> {
  const normalizedRefreshToken = refreshToken.trim();
  if (normalizedRefreshToken.length === 0) {
    throw new Error("refreshToken is required");
  }

  const key = await aesKeyFromSecret(requireEnv(env, "TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET"));
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const encryptedWithTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: AES_GCM_AUTH_TAG_BYTES * 8 },
      key,
      new TextEncoder().encode(normalizedRefreshToken),
    ),
  );
  const ciphertext = encryptedWithTag.slice(0, encryptedWithTag.length - AES_GCM_AUTH_TAG_BYTES);
  const authTag = encryptedWithTag.slice(encryptedWithTag.length - AES_GCM_AUTH_TAG_BYTES);
  return bytesToBase64(concatBytes(iv, authTag, ciphertext));
}

async function decryptStoredRefreshToken(encryptedRefreshToken: string, env: Env): Promise<string> {
  const normalizedCiphertext = encryptedRefreshToken.trim();
  if (normalizedCiphertext.length === 0) {
    return "";
  }

  const payload = base64ToBytes(normalizedCiphertext);
  if (payload.length <= AES_GCM_IV_BYTES + AES_GCM_AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted refresh token payload");
  }

  const iv = payload.slice(0, AES_GCM_IV_BYTES);
  const authTag = payload.slice(AES_GCM_IV_BYTES, AES_GCM_IV_BYTES + AES_GCM_AUTH_TAG_BYTES);
  const ciphertext = payload.slice(AES_GCM_IV_BYTES + AES_GCM_AUTH_TAG_BYTES);
  const key = await aesKeyFromSecret(requireEnv(env, "TOSS_REFRESH_TOKEN_ENCRYPTION_SECRET"));
  const encryptedPayload = concatBytes(ciphertext, authTag);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: AES_GCM_AUTH_TAG_BYTES * 8 },
    key,
    toArrayBuffer(encryptedPayload),
  );
  return new TextDecoder().decode(decrypted);
}

function toSingleRow<T>(data: unknown): T | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  return data[0] as T;
}

class SupabaseRestClient {
  private readonly env: Env;
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;

  public constructor(env: Env) {
    this.env = env;
    this.baseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/+$/, "");
    this.serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  }

  public async maybeSingle<T>(table: string, select: string, filters: Record<string, string>): Promise<T | null> {
    const data = await this.restRequest("GET", table, {
      select,
      filters,
    });
    return toSingleRow<T>(data);
  }

  public async rows<T>(table: string, select: string, filters: Record<string, string>): Promise<T[]> {
    const data = await this.restRequest("GET", table, { select, filters });
    return Array.isArray(data) ? (data as T[]) : [];
  }

  public async insert(table: string, payload: Record<string, unknown>): Promise<void> {
    await this.restRequest("POST", table, { payload });
  }

  public async upsert(table: string, payload: Record<string, unknown>, onConflict: string): Promise<void> {
    await this.restRequest("POST", table, {
      payload,
      onConflict,
      prefer: "resolution=merge-duplicates",
    });
  }

  public async update(
    table: string,
    payload: Record<string, unknown>,
    filters: Record<string, string>,
  ): Promise<void> {
    await this.restRequest("PATCH", table, { payload, filters });
  }

  public async deleteRows(table: string, filters: Record<string, string>): Promise<void> {
    await this.restRequest("DELETE", table, { filters });
  }

  public async rpc<T>(name: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.serviceHeaders("return=representation"),
      body: JSON.stringify(payload),
    });
    return await this.parseResponse<T>(response, `rpc:${name}`);
  }

  public async getUser(accessToken: string): Promise<SupabaseUser | null> {
    const response = await fetch(`${this.baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `${BEARER_AUTH_PREFIX}${accessToken}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      return null;
    }
    const data = await this.parseResponse<SupabaseAuthUserResponse>(response, "auth:getUser");
    return data.user ?? (isRecord(data) && typeof data.id === "string" ? (data as unknown as SupabaseUser) : null);
  }

  public async createUser(email: string, password: string, tossUserKey: string): Promise<SupabaseUser> {
    const data = await this.authAdminRequest<SupabaseAuthUserResponse>("POST", "/admin/users", {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        provider: "toss",
        toss_user_key: tossUserKey,
      },
    });
    const user = readSupabaseUser(data);
    if (user == null) {
      throw new Error("Supabase create user response missing user");
    }
    return user;
  }

  public async listUsers(page: number, perPage: number): Promise<SupabaseUser[]> {
    const url = new URL(`${this.baseUrl}/auth/v1/admin/users`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders(),
    });
    const data = await this.parseResponse<unknown>(response, "auth:listUsers");
    if (isRecord(data) && Array.isArray(data.users)) {
      return data.users as SupabaseUser[];
    }
    return [];
  }

  public async getUserById(userId: string): Promise<SupabaseUser | null> {
    const data = await this.authAdminRequest<SupabaseAuthUserResponse>("GET", `/admin/users/${userId}`);
    return readSupabaseUser(data);
  }

  public async updateUserById(userId: string, payload: Record<string, unknown>): Promise<void> {
    await this.authAdminRequest("PUT", `/admin/users/${userId}`, payload);
  }

  public async deleteUser(userId: string): Promise<void> {
    await this.authAdminRequest("DELETE", `/admin/users/${userId}`);
  }

  public async signInWithPassword(email: string, password: string): Promise<TossSessionResponse> {
    const authKey = readTrimmedEnv(this.env, "SUPABASE_ANON_KEY") || this.serviceRoleKey;
    const response = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: authKey,
        Authorization: `${BEARER_AUTH_PREFIX}${authKey}`,
        "Content-Type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await this.parseResponse<unknown>(response, "auth:signInWithPassword");
    if (!isRecord(data)) {
      throw new Error("Supabase sign-in response is invalid");
    }

    const accessToken = readString(data.access_token, "access_token");
    const refreshToken = readString(data.refresh_token, "refresh_token");
    const user = isRecord(data.user) ? data.user : null;
    const userId = readString(user?.id, "user.id");
    const userEmail = typeof user?.email === "string" ? user.email : email;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: userId,
        email: userEmail,
      },
    };
  }

  private async authAdminRequest<T = unknown>(
    method: string,
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/auth/v1${path}`, {
      method,
      headers: this.authHeaders(payload == null ? undefined : JSON_CONTENT_TYPE),
      body: payload == null ? undefined : JSON.stringify(payload),
    });
    return this.parseResponse<T>(response, `auth:${path}`);
  }

  private async restRequest(
    method: string,
    table: string,
    options: {
      readonly select?: string;
      readonly filters?: Record<string, string>;
      readonly payload?: Record<string, unknown>;
      readonly prefer?: string;
      readonly onConflict?: string;
    },
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    if (options.select != null) {
      url.searchParams.set("select", options.select);
    }
    if (options.onConflict != null) {
      url.searchParams.set("on_conflict", options.onConflict);
    }
    for (const [key, value] of Object.entries(options.filters ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method,
      headers: this.serviceHeaders(options.prefer ?? "return=minimal"),
      body: options.payload == null ? undefined : JSON.stringify(options.payload),
    });
    return this.parseResponse<unknown>(response, `rest:${table}`);
  }

  private serviceHeaders(prefer?: string): HeadersInit {
    const headers: Record<string, string> = {
      apikey: this.serviceRoleKey,
      Authorization: `${BEARER_AUTH_PREFIX}${this.serviceRoleKey}`,
      "Content-Type": JSON_CONTENT_TYPE,
    };
    if (prefer != null) {
      headers.Prefer = prefer;
    }
    return headers;
  }

  private authHeaders(contentType?: string): HeadersInit {
    const headers: Record<string, string> = {
      apikey: this.serviceRoleKey,
      Authorization: `${BEARER_AUTH_PREFIX}${this.serviceRoleKey}`,
    };
    if (contentType != null) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  private async parseResponse<T>(response: Response, context: string): Promise<T> {
    const text = await response.text();
    const data = text.trim().length > 0 ? safeJsonParse(text) : null;
    if (!response.ok) {
      throw new Error(`${context}:${readErrorMessage(data, response.status)}`);
    }
    return data as T;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readErrorMessage(data: unknown, status: number): string {
  if (isRecord(data)) {
    const message = data.message ?? data.msg ?? data.error_description ?? data.error;
    if (typeof message === "string") {
      return message;
    }
  }
  return `HTTP ${status}`;
}

function supabase(ctx: RequestContext): SupabaseRestClient {
  return new SupabaseRestClient(ctx.env);
}

function readSupabaseUser(data: unknown): SupabaseUser | null {
  if (!isRecord(data)) {
    return null;
  }

  if (isRecord(data.user) && typeof data.user.id === "string") {
    return data.user as unknown as SupabaseUser;
  }

  if (typeof data.id === "string") {
    return data as unknown as SupabaseUser;
  }

  return null;
}

function tossBaseUrl(env: Env): string {
  return (readTrimmedEnv(env, "TOSS_API_URL") || DEFAULT_TOSS_API_URL).replace(/\/+$/, "");
}

function tossIapBaseUrl(env: Env): string {
  return (readTrimmedEnv(env, "TOSS_IAP_API_URL") || DEFAULT_TOSS_IAP_API_URL).replace(/\/+$/, "");
}

async function tossMtlsRequest(ctx: RequestContext, url: string, init: RequestInit): Promise<unknown> {
  const response = await ctx.env.TOSS_MTLS_CERT.fetch(url, {
    ...init,
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text.trim().length > 0 ? safeJsonParse(text) : {};
  if (!response.ok) {
    const normalized = normalizeTossError(data);
    throw new HttpError(502, normalized.errorCode ?? "TOSS_REQUEST_FAILED", normalized.error, data);
  }
  return data;
}

function normalizeTossError(data: unknown): NormalizedTossError {
  if (isRecord(data) && "error" in data) {
    const error = data.error;
    if (isRecord(error)) {
      return {
        error: typeof error.reason === "string" ? error.reason : "Unknown error",
        errorCode: typeof error.errorCode === "string" ? error.errorCode : undefined,
      };
    }
    if (typeof error === "string") {
      return { error };
    }
  }
  if (isRecord(data)) {
    const apiError = data as ApiErrorBody;
    return {
      error: apiError.reason ?? apiError.message ?? apiError.msg ?? "Internal Server Error",
      errorCode: apiError.errorCode ?? apiError.code,
    };
  }
  return { error: "Internal Server Error" };
}

function readTossFailurePayload(data: unknown): NormalizedTossError | null {
  if (!isRecord(data)) {
    return null;
  }
  if (data.resultType === "FAIL" || typeof data.error === "string") {
    return normalizeTossError({ error: data.error });
  }
  return null;
}

function readSuccessPayload(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data) || data.resultType !== RESULT_SUCCESS || !isRecord(data.success)) {
    return null;
  }
  return data.success;
}

function parseTokenResponse(data: unknown): TossTokenSuccessDto | null {
  const success = readSuccessPayload(data);
  if (success == null) {
    return null;
  }

  const accessToken = success.accessToken;
  const refreshToken = success.refreshToken;
  const expiresIn = success.expiresIn;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return null;
  }

  const parsedExpiresIn =
    typeof expiresIn === "number"
      ? expiresIn
      : typeof expiresIn === "string"
        ? Number.parseInt(expiresIn, 10)
        : Number.NaN;

  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(parsedExpiresIn) ? parsedExpiresIn : 0,
  };
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalizedValues = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalizedValues.length === value.length ? normalizedValues : null;
}

function parseLoginMeResponse(data: unknown): TossLoginMeSuccessDto | null {
  const success = readSuccessPayload(data);
  if (success == null) {
    return null;
  }

  const userKey = success.userKey;
  const agreedTerms = readStringArray(success.agreedTerms);
  const email = success.email;
  if (typeof userKey !== "number" || !Number.isSafeInteger(userKey) || userKey <= 0) {
    return null;
  }
  if (agreedTerms == null) {
    return null;
  }
  if (email != null && typeof email !== "string") {
    return null;
  }
  return {
    userKey,
    agreedTerms,
    email: typeof email === "string" && email.trim().length > 0 ? email.trim() : null,
  };
}

async function getToken(ctx: RequestContext, authorizationCode: string, referrer: string): Promise<TossTokenSuccessDto> {
  const data = await tossMtlsRequest(ctx, `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`, {
    method: "POST",
    body: JSON.stringify({ authorizationCode, referrer }),
  });
  const failure = readTossFailurePayload(data);
  if (failure != null) {
    throw new HttpError(400, failure.errorCode ?? "TOSS_TOKEN_FAILED", failure.error, data);
  }

  const parsed = parseTokenResponse(data);
  if (parsed == null) {
    throw new HttpError(502, "TOSS_TOKEN_RESPONSE_INVALID", "Invalid token response shape", data);
  }
  return parsed;
}

async function getLoginMe(ctx: RequestContext, accessToken: string): Promise<TossLoginMeSuccessDto> {
  const data = await tossMtlsRequest(ctx, `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/user/oauth2/login-me`, {
    method: "GET",
    headers: { Authorization: `${BEARER_AUTH_PREFIX}${accessToken}` },
  });
  const failure = readTossFailurePayload(data);
  if (failure != null) {
    throw new HttpError(400, failure.errorCode ?? "TOSS_LOGIN_ME_FAILED", failure.error, data);
  }

  const parsed = parseLoginMeResponse(data);
  if (parsed == null) {
    throw new HttpError(502, "TOSS_LOGIN_ME_RESPONSE_INVALID", "Invalid login-me response shape", data);
  }
  return parsed;
}

async function getRefreshedTossAccessToken(ctx: RequestContext, refreshToken: string): Promise<string> {
  const normalizedRefreshToken = refreshToken.trim();
  if (normalizedRefreshToken.length === 0) {
    throw new Error("refreshToken is required");
  }

  const data = await tossMtlsRequest(ctx, `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/user/oauth2/refresh-token`, {
    method: "POST",
    body: JSON.stringify({ refreshToken: normalizedRefreshToken }),
  });
  const failure = readTossFailurePayload(data);
  if (failure != null) {
    throw new Error(failure.error);
  }

  const parsed = parseTokenResponse(data);
  if (parsed == null) {
    throw new Error("Invalid refresh-token response");
  }
  return parsed.accessToken;
}

async function removeTossAccessByUserKey(ctx: RequestContext, accessToken: string, tossUserKey: string): Promise<void> {
  const normalizedUserKey = tossUserKey.trim();
  if (!/^\d+$/.test(normalizedUserKey)) {
    throw new Error("Invalid toss user key format");
  }

  const parsedUserKey = Number(normalizedUserKey);
  if (!Number.isSafeInteger(parsedUserKey)) {
    throw new Error("toss user key exceeds Number safe integer range");
  }

  const data = await tossMtlsRequest(
    ctx,
    `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key`,
    {
      method: "POST",
      headers: { Authorization: `${BEARER_AUTH_PREFIX}${accessToken.trim()}` },
      body: JSON.stringify({ userKey: parsedUserKey }),
    },
  );
  const failure = readTossFailurePayload(data);
  if (failure != null) {
    throw new Error(failure.error);
  }
}

function tossEmailFromUserKey(tossUserKey: string): string {
  return `toss_${tossUserKey}@${TOSS_EMAIL_DOMAIN}`;
}

async function managedPassword(env: Env, email: string): Promise<string> {
  const secret = readTrimmedEnv(env, "TOSS_LOGIN_USER_SECRET") || "toss-login-managed";
  const hash = (await sha256Hex(`${secret}:${email}`)).slice(0, 24);
  return `TossLogin_${hash}`;
}

function readRequiredTossTermsTags(env: Env): string[] {
  const raw = requireEnv(env, "TOSS_REQUIRED_TERMS_TAGS");
  const termsTags = raw
    .split(REQUIRED_TERMS_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (termsTags.length === 0) {
    throw new Error("TOSS_REQUIRED_TERMS_TAGS must include at least one tag");
  }
  return termsTags;
}

function hasAllRequiredTerms(env: Env, agreedTerms: string[]): boolean {
  return readRequiredTossTermsTags(env).every((tag) => agreedTerms.includes(tag));
}

async function findManagedAuthUserByEmail(client: SupabaseRestClient, email: string): Promise<{ id: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length === 0) {
    return null;
  }

  let page = 1;
  while (page <= LIST_USERS_MAX_PAGES) {
    const users = await client.listUsers(page, LIST_USERS_PAGE_SIZE);
    const matchedUser = users.find((user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail);
    if (matchedUser?.id != null) {
      return { id: matchedUser.id };
    }
    if (users.length < LIST_USERS_PAGE_SIZE) {
      return null;
    }
    page += 1;
  }
  return null;
}

function isAuthUserAlreadyRegisteredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("email_exists") ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("email address has already been registered")
  );
}

async function createManagedTossAuthUser(
  ctx: RequestContext,
  client: SupabaseRestClient,
  tossUserKey: string,
): Promise<{ id: string }> {
  const email = tossEmailFromUserKey(tossUserKey);
  const password = await managedPassword(ctx.env, email);

  try {
    const user = await client.createUser(email, password, tossUserKey);
    return { id: user.id };
  } catch (error: unknown) {
    if (isAuthUserAlreadyRegisteredError(error)) {
      const existingUser = await findManagedAuthUserByEmail(client, email);
      if (existingUser != null) {
        return existingUser;
      }
    }
    throw error;
  }
}

async function findAuthUserIdByTossUserKey(client: SupabaseRestClient, tossUserKey: string): Promise<string | null> {
  const accountMapping = await client.maybeSingle<{ auth_user_id?: string }>("toss_accounts", "auth_user_id", {
    toss_user_key: `eq.${tossUserKey}`,
  });
  if (typeof accountMapping?.auth_user_id === "string" && accountMapping.auth_user_id.trim().length > 0) {
    return accountMapping.auth_user_id;
  }

  const profileMapping = await client.maybeSingle<{ id?: string }>("user_profiles", "id", {
    toss_user_key: `eq.${tossUserKey}`,
  });
  if (typeof profileMapping?.id === "string" && profileMapping.id.trim().length > 0) {
    return profileMapping.id;
  }
  return null;
}

async function resolveOrCreateAuthUserIdByTossUserKey(
  ctx: RequestContext,
  client: SupabaseRestClient,
  tossUserKey: string,
): Promise<string> {
  const existingAuthUserId = await findAuthUserIdByTossUserKey(client, tossUserKey);
  if (existingAuthUserId != null) {
    return existingAuthUserId;
  }
  return (await createManagedTossAuthUser(ctx, client, tossUserKey)).id;
}

async function saveStoredTossRefreshToken(
  ctx: RequestContext,
  client: SupabaseRestClient,
  authUserId: string,
  tossUserKey: string,
  refreshToken: string,
): Promise<void> {
  const encryptedRefreshToken = await encryptStoredRefreshToken(refreshToken, ctx.env);
  await client.deleteRows("toss_auth_links", { auth_user_id: `eq.${authUserId}` });
  await client.deleteRows("toss_auth_links", { toss_user_key: `eq.${tossUserKey}` });
  await client.insert("toss_auth_links", {
    auth_user_id: authUserId,
    toss_user_key: tossUserKey,
    encrypted_refresh_token: encryptedRefreshToken,
  });
}

async function verifyTossAuthLinkReadableAfterSave(
  ctx: RequestContext,
  client: SupabaseRestClient,
  authUserId: string,
  tossUserKey: string,
): Promise<void> {
  const data = await client.maybeSingle<{ toss_user_key?: string; encrypted_refresh_token?: string }>(
    "toss_auth_links",
    "toss_user_key,encrypted_refresh_token",
    { auth_user_id: `eq.${authUserId}` },
  );
  if (data == null) {
    throw new Error("toss_auth_links saved row missing");
  }
  if (data.toss_user_key !== tossUserKey) {
    throw new Error("toss_auth_links saved user key mismatch");
  }
  const cipher = typeof data.encrypted_refresh_token === "string" ? data.encrypted_refresh_token.trim() : "";
  if (cipher.length === 0) {
    throw new Error("toss_auth_links saved ciphertext missing");
  }
  const plain = await decryptStoredRefreshToken(cipher, ctx.env);
  if (plain.trim().length === 0) {
    throw new Error("toss_auth_links decrypted refresh token empty");
  }
}

async function syncTossAccountMapping(
  client: SupabaseRestClient,
  authUserId: string,
  tossUserKey: string,
): Promise<void> {
  await client.deleteRows("toss_accounts", {
    auth_user_id: `eq.${authUserId}`,
    toss_user_key: `neq.${tossUserKey}`,
  });
  await client.upsert(
    "toss_accounts",
    {
      auth_user_id: authUserId,
      toss_user_key: tossUserKey,
    },
    "toss_user_key",
  );
}

async function syncUserProfileForToss(
  client: SupabaseRestClient,
  authUserId: string,
  tossUserKey: string,
): Promise<void> {
  await client.update("user_profiles", { toss_user_key: null }, { toss_user_key: `eq.${tossUserKey}`, id: `neq.${authUserId}` });
  const profile = await client.maybeSingle<{ id?: string; toss_user_key?: string | null }>(
    "user_profiles",
    "id,toss_user_key",
    { id: `eq.${authUserId}` },
  );
  if (typeof profile?.id === "string" && profile.id.trim().length > 0) {
    if (profile.toss_user_key !== tossUserKey) {
      await client.update("user_profiles", { toss_user_key: tossUserKey }, { id: `eq.${authUserId}` });
    }
    return;
  }

  await client.insert("user_profiles", {
    id: authUserId,
    toss_user_key: tossUserKey,
  });
}

async function syncOptionalTossMetadata(
  client: SupabaseRestClient,
  authUserId: string,
  tossUserKey: string,
  encryptedEmail: string | null,
): Promise<void> {
  const user = await client.getUserById(authUserId);
  if (user == null) {
    throw new Error("Auth user not found");
  }

  const currentMetadata = isRecord(user.user_metadata) ? user.user_metadata : {};
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    provider: "toss",
    toss_user_key: tossUserKey,
  };
  if (encryptedEmail != null) {
    nextMetadata.toss_email_encrypted = encryptedEmail;
  }
  await client.updateUserById(authUserId, { user_metadata: nextMetadata });
}

async function signInManagedTossUser(
  ctx: RequestContext,
  client: SupabaseRestClient,
  authUserId: string,
  tossUserKey: string,
): Promise<TossSessionResponse> {
  const email = tossEmailFromUserKey(tossUserKey);
  const password = await managedPassword(ctx.env, email);
  await client.updateUserById(authUserId, { password });
  return client.signInWithPassword(email, password);
}

async function issueSessionForUser(
  ctx: RequestContext,
  client: SupabaseRestClient,
  authUserId: string,
): Promise<TossSessionResponse> {
  const profile = await client.maybeSingle<{ toss_user_key?: string | null }>("user_profiles", "toss_user_key", {
    id: `eq.${authUserId}`,
  });
  const tossUserKey = typeof profile?.toss_user_key === "string" ? profile.toss_user_key.trim() : "";
  if (tossUserKey.length === 0) {
    throw new Error("Mapped toss_user_key is required to issue session");
  }
  return signInManagedTossUser(ctx, client, authUserId, tossUserKey);
}

async function finalizeTossLoginExchange(
  ctx: RequestContext,
  tossUserKey: string,
  encryptedEmail: string | null,
  agreedTerms: string[],
  refreshToken: string,
): Promise<TossSessionResponse> {
  const normalizedUserKey = tossUserKey.trim();
  if (normalizedUserKey.length === 0) {
    throw new Error("tossUserKey is required");
  }
  if (!hasAllRequiredTerms(ctx.env, agreedTerms)) {
    throw new HttpError(400, "REQUIRED_TOSS_TERMS_MISSING", "Required Toss terms are missing from login-me response");
  }

  const client = supabase(ctx);
  const authUserId = await resolveOrCreateAuthUserIdByTossUserKey(ctx, client, normalizedUserKey);
  await saveStoredTossRefreshToken(ctx, client, authUserId, normalizedUserKey, refreshToken);
  await verifyTossAuthLinkReadableAfterSave(ctx, client, authUserId, normalizedUserKey);
  await syncTossAccountMapping(client, authUserId, normalizedUserKey);
  await syncUserProfileForToss(client, authUserId, normalizedUserKey);
  await syncOptionalTossMetadata(client, authUserId, normalizedUserKey, encryptedEmail);
  return issueSessionForUser(ctx, client, authUserId);
}

async function handleTossExchange(ctx: RequestContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  if (!isRecord(body)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Request body must be an object");
  }

  const authorizationCode = typeof body.authorizationCode === "string" ? body.authorizationCode.trim() : "";
  const referrer = typeof body.referrer === "string" ? body.referrer.trim() : "";
  if (authorizationCode.length === 0 || referrer.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "authorizationCode and referrer are required");
  }

  const token = await getToken(ctx, authorizationCode, referrer);
  const loginMe = await getLoginMe(ctx, token.accessToken);
  const session = await finalizeTossLoginExchange(
    ctx,
    String(loginMe.userKey),
    loginMe.email,
    loginMe.agreedTerms,
    token.refreshToken,
  );
  return jsonResponse(ctx, session);
}

async function readStoredTossLinkByAuthUserId(
  ctx: RequestContext,
  client: SupabaseRestClient,
  authUserId: string,
): Promise<TossAuthLinkRecord | null> {
  const row = await client.maybeSingle<{ toss_user_key?: unknown; encrypted_refresh_token?: unknown }>(
    "toss_auth_links",
    "toss_user_key,encrypted_refresh_token",
    { auth_user_id: `eq.${authUserId}` },
  );
  return mapStoredTossLinkRow(ctx, row);
}

async function readStoredTossLinkByTossUserKey(
  ctx: RequestContext,
  client: SupabaseRestClient,
  tossUserKey: string,
): Promise<TossAuthLinkRecord | null> {
  const row = await client.maybeSingle<{ toss_user_key?: unknown; encrypted_refresh_token?: unknown }>(
    "toss_auth_links",
    "toss_user_key,encrypted_refresh_token",
    { toss_user_key: `eq.${tossUserKey}` },
  );
  return mapStoredTossLinkRow(ctx, row);
}

async function mapStoredTossLinkRow(
  ctx: RequestContext,
  row: { toss_user_key?: unknown; encrypted_refresh_token?: unknown } | null,
): Promise<TossAuthLinkRecord | null> {
  if (row == null) {
    return null;
  }

  const tossUserKey = typeof row.toss_user_key === "string" ? row.toss_user_key.trim() : "";
  const cipher = typeof row.encrypted_refresh_token === "string" ? row.encrypted_refresh_token.trim() : "";
  if (tossUserKey.length === 0 || cipher.length === 0) {
    return null;
  }

  const refreshToken = await decryptStoredRefreshToken(cipher, ctx.env);
  if (refreshToken.trim().length === 0) {
    return null;
  }
  return { tossUserKey, refreshToken };
}

async function readStoredTossLinkRecord(
  ctx: RequestContext,
  client: SupabaseRestClient,
  authUserId: string,
): Promise<TossAuthLinkRecord | null> {
  const directRecord = await readStoredTossLinkByAuthUserId(ctx, client, authUserId);
  if (directRecord != null) {
    return directRecord;
  }

  const profile = await client.maybeSingle<{ toss_user_key?: string | null }>("user_profiles", "toss_user_key", {
    id: `eq.${authUserId}`,
  });
  const mappedTossUserKey = typeof profile?.toss_user_key === "string" ? profile.toss_user_key.trim() : "";
  if (mappedTossUserKey.length === 0) {
    return null;
  }
  return readStoredTossLinkByTossUserKey(ctx, client, mappedTossUserKey);
}

async function unlinkByAuthUserIdAtomic(ctx: RequestContext, authUserId: string): Promise<string> {
  const client = supabase(ctx);
  const storedLink = await readStoredTossLinkRecord(ctx, client, authUserId);
  if (storedLink == null) {
    return "official_unlink_failed";
  }

  try {
    const refreshedAccessToken = await getRefreshedTossAccessToken(ctx, storedLink.refreshToken);
    await removeTossAccessByUserKey(ctx, refreshedAccessToken, storedLink.tossUserKey);
  } catch (error: unknown) {
    console.error(`[${ctx.requestId}] Toss official unlink failed`, error);
    return "official_unlink_failed";
  }

  await client.rpc("rpc_toss_self_unlink", { target_user_id: authUserId });
  return "unlinked";
}

async function handleSelfUnlink(ctx: RequestContext): Promise<Response> {
  const accessToken = readBearerToken(ctx.request.headers.get("Authorization"));
  if (accessToken.length === 0) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const user = await supabase(ctx).getUser(accessToken);
  if (user == null) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const action = await unlinkByAuthUserIdAtomic(ctx, user.id);
  return jsonResponse(ctx, { action });
}

function readPlanAmounts(env: Env): PlanAmounts {
  const pro = Number(readTrimmedEnv(env, "PLAN_AMOUNT_PRO") || "5907");
  const premium = Number(readTrimmedEnv(env, "PLAN_AMOUNT_PREMIUM") || "9900");
  if (!Number.isInteger(pro) || pro <= 0 || !Number.isInteger(premium) || premium <= 0) {
    throw new HttpError(500, "INVALID_PLAN_AMOUNTS", "PLAN_AMOUNT_PRO and PLAN_AMOUNT_PREMIUM must be positive integers");
  }
  return { pro, premium };
}

function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === "pro" || value === "premium";
}

function parseVerifyBody(raw: unknown): { paymentId: string; planId: PaidPlanId; quantity?: number } {
  if (!isRecord(raw) || typeof raw.paymentId !== "string" || !isPaidPlanId(raw.planId)) {
    throw new HttpError(400, "INVALID_PAYMENT_PAYLOAD", "Invalid payment verification payload");
  }

  const quantity = raw.quantity;
  if (quantity != null) {
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > QUANTITY_MAX) {
      throw new HttpError(400, "INVALID_PAYMENT_QUANTITY", "Invalid payment quantity");
    }
    return { paymentId: raw.paymentId, planId: raw.planId, quantity };
  }
  return { paymentId: raw.paymentId, planId: raw.planId };
}

function parseTossConfirmResponse(raw: unknown): TossConfirmResponse {
  if (!isRecord(raw)) {
    return {};
  }
  return {
    status: typeof raw.status === "string" ? raw.status : undefined,
    totalAmount:
      typeof raw.totalAmount === "number" || typeof raw.totalAmount === "string" ? raw.totalAmount : undefined,
  };
}

function deriveQuantityFromAmount(actualAmount: number, unitPrice: number): number | null {
  const safeAmount = Math.round(actualAmount);
  if (unitPrice <= 0 || safeAmount < unitPrice) {
    return null;
  }

  const quantity = safeAmount / unitPrice;
  const roundedQuantity = Math.round(quantity);
  if (Math.abs(roundedQuantity - quantity) > Number.EPSILON) {
    return null;
  }
  return roundedQuantity >= 1 && roundedQuantity <= QUANTITY_MAX ? roundedQuantity : null;
}

function normalizeTier(value?: string | null): SubscriptionTier {
  if (value === "premium" || value === "pro" || value === "enterprise") {
    return value;
  }
  return "free";
}

function normalizePendingPlan(value?: string | null): PaidPlanId | null {
  return value === "premium" || value === "pro" ? value : null;
}

function parseIsoMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

function addDaysUtc(ms: number, days: number): number {
  return ms + days * MS_PER_DAY;
}

function getTierLimits(tier: SubscriptionTier): { maxPortfolios: number; maxAlarms: number } {
  if (tier === "premium") {
    return { maxPortfolios: 20, maxAlarms: 40 };
  }
  if (tier === "pro") {
    return { maxPortfolios: 5, maxAlarms: 10 };
  }
  return { maxPortfolios: 3, maxAlarms: 4 };
}

function buildEffectiveState(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  expiresAt: string | null,
  pendingPlan: PaidPlanId | null,
  pendingPlanEffectiveAt: string | null,
  nowMs: number,
): EffectiveSubscriptionState {
  const limits = getTierLimits(tier);
  const expiresMs = parseIsoMs(expiresAt);
  const isExpired = expiresMs != null && expiresMs <= nowMs;
  const isActiveStatus = status === "active" || status === "trial" || status == null;
  return {
    tier: isExpired ? "free" : tier,
    status: isExpired ? "expired" : status,
    expiresAt,
    pendingPlan,
    pendingPlanEffectiveAt,
    isActive: !isExpired && isActiveStatus && tier !== "free",
    isExpired,
    maxPortfolios: isExpired ? 3 : limits.maxPortfolios,
    maxAlarms: isExpired ? 4 : limits.maxAlarms,
  };
}

function getEffectiveSubscriptionState(
  profile: SubscriptionProfileSnapshot | null | undefined,
  nowIso?: string,
): EffectiveSubscriptionState {
  const nowMs = nowIso ? parseIsoMs(nowIso) ?? Date.now() : Date.now();
  const tier = normalizeTier(profile?.subscription_tier);
  const status = (profile?.subscription_status as SubscriptionStatus | undefined) ?? null;
  const expiresAt = profile?.subscription_expires_at ?? null;
  const expiresMs = parseIsoMs(expiresAt);
  const pendingPlan = normalizePendingPlan(profile?.pending_plan);
  const pendingEffectiveAt = profile?.pending_plan_effective_at ?? null;
  const pendingEffectiveMs = parseIsoMs(pendingEffectiveAt);

  if (expiresMs != null && expiresMs <= nowMs) {
    return buildEffectiveState("free", "expired", expiresAt, null, null, nowMs);
  }
  if (pendingPlan && pendingEffectiveMs != null && pendingEffectiveMs <= nowMs && expiresMs != null && expiresMs > nowMs) {
    return buildEffectiveState(pendingPlan, "active", expiresAt, pendingPlan, pendingEffectiveAt, nowMs);
  }
  return buildEffectiveState(tier, status, expiresAt, pendingPlan, pendingEffectiveAt, nowMs);
}

function getNormalizedProfileUpdate(
  profile: SubscriptionProfileSnapshot | null | undefined,
  nowIso?: string,
): Partial<OrderProfileRow> | null {
  if (profile == null) {
    return null;
  }

  const nowMs = nowIso ? parseIsoMs(nowIso) ?? Date.now() : Date.now();
  const effective = getEffectiveSubscriptionState(profile, nowIso);
  const rawTier = normalizeTier(profile.subscription_tier);
  const rawStatus = (profile.subscription_status as SubscriptionStatus | undefined) ?? null;
  const rawPendingPlan = normalizePendingPlan(profile.pending_plan);
  const rawPendingEffectiveAt = profile.pending_plan_effective_at ?? null;
  const expiresMs = parseIsoMs(profile.subscription_expires_at);

  if (expiresMs != null && expiresMs <= nowMs) {
    if (rawTier === "free" && rawStatus === "expired" && rawPendingPlan == null && rawPendingEffectiveAt == null) {
      return null;
    }
    return {
      subscription_tier: "free",
      subscription_status: "expired",
      pending_plan: null,
      pending_plan_effective_at: null,
      max_portfolios: 3,
      max_alarms: 4,
    };
  }

  const rawPendingEffectiveMs = parseIsoMs(rawPendingEffectiveAt);
  if (rawPendingPlan && rawPendingEffectiveAt && rawPendingEffectiveMs != null && rawPendingEffectiveMs <= nowMs) {
    return {
      subscription_tier: effective.tier,
      subscription_status: "active",
      pending_plan: null,
      pending_plan_effective_at: null,
      max_portfolios: effective.maxPortfolios,
      max_alarms: effective.maxAlarms,
    };
  }
  return null;
}

function computeSubscriptionUpdate(input: {
  readonly currentProfile: SubscriptionProfileSnapshot | null | undefined;
  readonly purchasedPlan: PaidPlanId;
  readonly quantity: number;
  readonly planAmounts: PlanAmounts;
  readonly nowIso?: string;
}): SubscriptionUpdateResult {
  const nowMs = input.nowIso ? parseIsoMs(input.nowIso) ?? Date.now() : Date.now();
  const baseProfile = input.currentProfile ?? null;
  const normalizedPatch = getNormalizedProfileUpdate(baseProfile, toIsoUtc(nowMs));
  const normalizedProfile = normalizedPatch ? { ...baseProfile, ...normalizedPatch } : baseProfile;
  const current = getEffectiveSubscriptionState(normalizedProfile, toIsoUtc(nowMs));
  const purchasedDays = PLAN_DAYS_PER_UNIT * Math.max(1, input.quantity);
  const purchasedPlan = input.purchasedPlan;

  if (!current.isActive || current.tier === "free") {
    const limits = getTierLimits(purchasedPlan);
    return {
      nextTier: purchasedPlan,
      nextStatus: "active",
      nextExpiresAt: toIsoUtc(addDaysUtc(nowMs, purchasedDays)),
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays: 0,
      appliedCase: 1,
    };
  }

  const currentExpiresMs = parseIsoMs(current.expiresAt) ?? nowMs;
  const rollingBaseMs = Math.max(currentExpiresMs, nowMs);
  if (current.tier === purchasedPlan) {
    const limits = getTierLimits(current.tier);
    return {
      nextTier: current.tier,
      nextStatus: "active",
      nextExpiresAt: toIsoUtc(addDaysUtc(rollingBaseMs, purchasedDays)),
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays: 0,
      appliedCase: 2,
    };
  }

  if (current.tier === "pro" && purchasedPlan === "premium") {
    const remainingMs = Math.max(currentExpiresMs - nowMs, 0);
    const remainingDays = Math.ceil(remainingMs / MS_PER_DAY);
    const remainingValue = remainingDays * (input.planAmounts.pro / PLAN_DAYS_PER_UNIT);
    const bonusDays = Math.ceil(remainingValue / (input.planAmounts.premium / PLAN_DAYS_PER_UNIT));
    const limits = getTierLimits("premium");
    return {
      nextTier: "premium",
      nextStatus: "active",
      nextExpiresAt: toIsoUtc(addDaysUtc(nowMs, purchasedDays + bonusDays)),
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays,
      appliedCase: 3,
    };
  }

  if (current.tier === "premium" && purchasedPlan === "pro") {
    const limits = getTierLimits("premium");
    return {
      nextTier: "premium",
      nextStatus: "active",
      nextExpiresAt: toIsoUtc(addDaysUtc(rollingBaseMs, purchasedDays)),
      pendingPlan: "pro",
      pendingPlanEffectiveAt: toIsoUtc(currentExpiresMs),
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays: 0,
      appliedCase: 4,
    };
  }

  const fallbackLimits = getTierLimits(purchasedPlan);
  return {
    nextTier: purchasedPlan,
    nextStatus: "active",
    nextExpiresAt: toIsoUtc(addDaysUtc(nowMs, purchasedDays)),
    pendingPlan: null,
    pendingPlanEffectiveAt: null,
    maxPortfolios: fallbackLimits.maxPortfolios,
    maxAlarms: fallbackLimits.maxAlarms,
    bonusDays: 0,
    appliedCase: 1,
  };
}

function toClaimOrderResult(raw: unknown): ClaimOrderResult {
  if (!isRecord(raw)) {
    return { success: false, error: "Response is not an object" };
  }
  if (raw.success !== true) {
    return {
      success: false,
      error: typeof raw.error === "string" ? raw.error : "Invalid RPC response",
    };
  }
  return {
    success: true,
    claimed: raw.claimed === true,
    already_processed: raw.already_processed === true,
    in_progress: raw.in_progress === true,
    order_id: typeof raw.order_id === "string" ? raw.order_id : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

async function markOrderStatus(
  client: SupabaseRestClient,
  paymentId: string,
  updatePayload: OrderStatusUpdate,
): Promise<void> {
  await client.update("orders", { ...updatePayload }, { payment_id: `eq.${paymentId}` });
}

async function fulfillPaidOrder(
  ctx: RequestContext,
  client: SupabaseRestClient,
  params: FulfillPaidOrderParams,
): Promise<FulfillPaidOrderResult> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const claim = toClaimOrderResult(
    await client.rpc("claim_order_processing", {
      p_payment_id: params.paymentId,
      p_user_id: params.userId,
      p_plan_id: params.planId,
      p_order_name: params.orderName,
      p_amount: params.amount,
      p_currency: params.currency,
      p_pay_method: params.payMethod,
      p_pg_provider: params.pgProvider,
      p_pg_tx_id: params.pgTxId ?? null,
      p_paid_at: params.paidAt ?? null,
      p_metadata: {
        quantity: params.quantity,
        ...(params.metadata ?? {}),
      },
    }),
  );

  if (!claim.success) {
    throw new Error(claim.error || "Failed to claim order processing");
  }
  if (claim.already_processed) {
    return { success: true, alreadyProcessed: true, message: "이미 처리된 결제입니다." };
  }
  if (claim.in_progress && !claim.claimed) {
    return { success: false, inProgress: true, message: "동일 결제 건을 다른 요청이 처리 중입니다." };
  }

  const profile = await client.maybeSingle<OrderProfileRow>(
    "user_profiles",
    "id,subscription_tier,subscription_status,subscription_expires_at,pending_plan,pending_plan_effective_at,max_portfolios,max_alarms",
    { id: `eq.${params.userId}` },
  );
  if (profile == null) {
    await markOrderStatus(client, params.paymentId, {
      status: "pending",
      metadata: { quantity: params.quantity, ...(params.metadata ?? {}), fulfillment_error: "user profile not found" },
      paid_at: params.paidAt,
      pg_tx_id: params.pgTxId,
    });
    throw new Error("user profile not found");
  }

  const normalizedPatch = getNormalizedProfileUpdate(profile, nowIso);
  const normalizedProfile = normalizedPatch ? { ...profile, ...normalizedPatch } : profile;
  const fulfillment = computeSubscriptionUpdate({
    currentProfile: normalizedProfile,
    purchasedPlan: params.planId,
    quantity: params.quantity,
    planAmounts: params.planAmounts,
    nowIso,
  });
  const previousEffective = getEffectiveSubscriptionState(normalizedProfile, nowIso);
  await client.update(
    "user_profiles",
    {
      subscription_tier: fulfillment.nextTier,
      subscription_status: fulfillment.nextStatus,
      subscription_expires_at: fulfillment.nextExpiresAt,
      pending_plan: fulfillment.pendingPlan,
      pending_plan_effective_at: fulfillment.pendingPlanEffectiveAt,
      max_portfolios: fulfillment.maxPortfolios,
      max_alarms: fulfillment.maxAlarms,
      updated_at: nowIso,
    },
    { id: `eq.${params.userId}` },
  );

  const finalMetadata = {
    quantity: params.quantity,
    ...(params.metadata ?? {}),
    fulfillment: {
      previousTier: previousEffective.tier,
      previousExpiresAt: previousEffective.expiresAt,
      appliedCase: fulfillment.appliedCase,
      bonusDays: fulfillment.bonusDays,
      pendingPlan: fulfillment.pendingPlan,
      pendingPlanEffectiveAt: fulfillment.pendingPlanEffectiveAt,
      fulfilledAt: nowIso,
      fulfillmentVersion: 1,
    },
  };
  await markOrderStatus(client, params.paymentId, {
    status: "paid",
    metadata: finalMetadata,
    paid_at: params.paidAt ?? nowIso,
    pg_tx_id: params.pgTxId,
  });

  const finalState = getEffectiveSubscriptionState(
    {
      ...normalizedProfile,
      subscription_tier: fulfillment.nextTier,
      subscription_status: fulfillment.nextStatus,
      subscription_expires_at: fulfillment.nextExpiresAt,
      pending_plan: fulfillment.pendingPlan,
      pending_plan_effective_at: fulfillment.pendingPlanEffectiveAt,
    },
    nowIso,
  );
  console.info(`[${ctx.requestId}] payment fulfillment completed`, {
    paymentId: params.paymentId,
    userId: params.userId,
    planId: params.planId,
  });
  return {
    success: true,
    message: "결제 Fulfillment가 완료되었습니다.",
    subscription: finalState,
    fulfillment,
  };
}

async function handleTossPaymentVerify(ctx: RequestContext): Promise<Response> {
  const parsedBody = parseVerifyBody(await readJsonBody(ctx.request));
  const authHeader = ctx.request.headers.get("Authorization");
  const accessToken = readBearerToken(authHeader);
  if (accessToken.length === 0) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing Authorization header");
  }

  const client = supabase(ctx);
  const user = await client.getUser(accessToken);
  if (user == null) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired token");
  }

  const planAmounts = readPlanAmounts(ctx.env);
  const quantity = parsedBody.quantity ?? DEFAULT_PAYMENT_QUANTITY;
  const expectedAmount = planAmounts[parsedBody.planId] * quantity;
  const paymentsSecret =
    readTrimmedEnv(ctx.env, "TOSS_PAYMENTS_SECRET_KEY") ||
    readTrimmedEnv(ctx.env, "TOSS_SECRET_KEY");
  const response = await fetch(`${TOSS_PAYMENTS_API_URL}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      ...(paymentsSecret.length > 0
        ? { Authorization: basicAuthHeader(paymentsSecret, "") }
        : {}),
    },
    body: JSON.stringify({
      paymentKey: parsedBody.paymentId,
      orderId: parsedBody.paymentId,
      amount: expectedAmount,
    }),
  });
  const paymentData = parseTossConfirmResponse(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new HttpError(502, "PAYMENT_GATEWAY_ERROR", "Failed to communicate with payment gateway");
  }
  if (paymentData.status !== "DONE") {
    return jsonResponse(ctx, { success: false, message: "Payment status is not DONE" });
  }

  const actualAmount = Number(paymentData.totalAmount) || 0;
  const fulfilledQuantity = deriveQuantityFromAmount(actualAmount, planAmounts[parsedBody.planId]);
  if (fulfilledQuantity == null) {
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match any allowed plan quantity.");
  }

  const fulfillment = await fulfillPaidOrder(ctx, client, {
    paymentId: parsedBody.paymentId,
    userId: user.id,
    planId: parsedBody.planId,
    quantity: fulfilledQuantity,
    amount: actualAmount,
    currency: "KRW",
    payMethod: "CARD",
    pgProvider: "TOSS_PAYMENTS",
    pgTxId: parsedBody.paymentId,
    paidAt: new Date().toISOString(),
    orderName: `${parsedBody.planId.toUpperCase()} Plan (${fulfilledQuantity * PLAN_DAYS_PER_UNIT}일)`,
    planAmounts,
    metadata: { source: "toss-payments-verify" },
  });

  if (fulfillment.inProgress) {
    return jsonResponse(ctx, { success: false, error: fulfillment.message }, 202);
  }
  return jsonResponse(ctx, {
    success: true,
    message: fulfillment.alreadyProcessed ? "Payment already processed." : "Payment verified successfully.",
    subscription: {
      tier: fulfillment.subscription?.tier ?? parsedBody.planId,
      status: fulfillment.subscription?.status ?? "active",
      expiresAt: fulfillment.subscription?.expiresAt ?? null,
    },
  });
}

async function handleTossIapVerify(ctx: RequestContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  const orderId = isRecord(body) && typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (orderId.length === 0) {
    throw new HttpError(400, "MISSING_ORDER_ID", "Missing orderId");
  }

  const accessToken = readBearerToken(ctx.request.headers.get("Authorization"));
  if (accessToken.length === 0) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing Authorization header");
  }

  const client = supabase(ctx);
  const user = await client.getUser(accessToken);
  if (user == null) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired token");
  }

  const profile = await client.maybeSingle<{ toss_user_key?: string | null }>("user_profiles", "toss_user_key", {
    id: `eq.${user.id}`,
  });
  const tossUserKey = typeof profile?.toss_user_key === "string" ? profile.toss_user_key.trim() : "";
  if (tossUserKey.length === 0) {
    throw new HttpError(400, "TOSS_USER_KEY_NOT_FOUND", "toss_user_key not found. Toss login required.");
  }

  const orderStatusRes = await tossMtlsRequest(
    ctx,
    `${tossIapBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/order/get-order-status`,
    {
      method: "POST",
      headers: { "x-toss-user-key": tossUserKey },
      body: JSON.stringify({ orderId }),
    },
  );
  const successPayload = isRecord(orderStatusRes) && isRecord(orderStatusRes.success) ? orderStatusRes.success : orderStatusRes;
  const status = isRecord(successPayload) && typeof successPayload.status === "string" ? successPayload.status : "";
  if (status !== "COMPLETED" && status !== "PURCHASED") {
    throw new HttpError(400, "ORDER_NOT_COMPLETED", `Order not in completed state: ${status}`);
  }

  const product = isRecord(successPayload) && isRecord(successPayload.product) ? successPayload.product : {};
  const sku =
    (isRecord(product) && typeof product.id === "string" ? product.id : null) ??
    (isRecord(successPayload) && typeof successPayload.sku === "string" ? successPayload.sku : null) ??
    (isRecord(successPayload) && typeof successPayload.productId === "string" ? successPayload.productId : null);
  const expectedSku = requireEnv(ctx.env, "TOSS_IAP_PRO_PRODUCT_ID");
  if (sku !== expectedSku) {
    throw new HttpError(400, "INVALID_PRODUCT_SKU", "Invalid product SKU");
  }

  const planAmounts = readPlanAmounts(ctx.env);
  const fulfillment = await fulfillPaidOrder(ctx, client, {
    paymentId: orderId,
    userId: user.id,
    planId: "pro",
    quantity: 1,
    amount: planAmounts.pro,
    currency: "KRW",
    payMethod: "IAP",
    pgProvider: "toss_iap",
    pgTxId: orderId,
    paidAt: new Date().toISOString(),
    orderName: `PRO Plan (${PLAN_DAYS_PER_UNIT}일)`,
    planAmounts,
    metadata: {
      source: "toss-iap-verify",
      sku,
      orderStatus: status,
    },
  });

  if (fulfillment.inProgress) {
    return jsonResponse(ctx, { success: false, error: fulfillment.message }, 202);
  }
  return jsonResponse(ctx, { success: true, message: fulfillment.message });
}

async function sendMessage(ctx: RequestContext, userKey: string, templateSetCode: string, context: TossSmartMessageContext): Promise<SendMessageApiResult> {
  const data = await tossMtlsRequest(ctx, `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/messenger/send-message`, {
    method: "POST",
    headers: { "x-toss-user-key": userKey },
    body: JSON.stringify({ templateSetCode, context }),
  });
  const failure = readTossFailurePayload(data);
  if (failure != null) {
    throw new HttpError(502, failure.errorCode ?? "TOSS_SEND_MESSAGE_FAILED", failure.error, data);
  }
  const successPayload = readSendMessageSuccessPayload(data);
  if (successPayload == null) {
    throw new HttpError(502, "TOSS_SEND_MESSAGE_RESPONSE_INVALID", "Invalid send-message response shape", data);
  }
  return successPayload;
}

function readSendMessageSuccessPayload(data: unknown): SendMessageApiResult | null {
  if (!isRecord(data) || data.resultType !== RESULT_SUCCESS) {
    return null;
  }

  if (isRecord(data.result)) {
    return data.result as SendMessageApiResult;
  }

  if (isRecord(data.success)) {
    return data.success as SendMessageApiResult;
  }

  return {};
}

async function handleTossSmartMessage(ctx: RequestContext): Promise<Response> {
  const internalSecret = readTrimmedEnv(ctx.env, "INTERNAL_ALARM_SECRET");
  const headerSecret = ctx.request.headers.get("x-internal-alarm-secret") ?? "";
  if (internalSecret.length === 0 || !constantTimeEqual(headerSecret, internalSecret)) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const body = await readJsonBody(ctx.request);
  if (!isRecord(body) || typeof body.userId !== "string" || !isRecord(body.context)) {
    throw new HttpError(400, "INVALID_SMART_MESSAGE_PAYLOAD", "Invalid smart message payload");
  }
  const userId = body.userId.trim();
  const date = typeof body.context.date === "string" ? body.context.date.trim() : "";
  const screenName = typeof body.context.screenName === "string" ? body.context.screenName.trim() : "";
  if (userId.length === 0 || date.length === 0 || screenName !== requireEnv(ctx.env, "TOSS_SMART_MESSAGE_SCREEN_NAME")) {
    throw new HttpError(400, "INVALID_SMART_MESSAGE_PAYLOAD", "Invalid smart message payload");
  }

  const profile = await supabase(ctx).maybeSingle<{ toss_user_key?: string | null }>("user_profiles", "toss_user_key", {
    id: `eq.${userId}`,
  });
  const tossUserKey = typeof profile?.toss_user_key === "string" ? profile.toss_user_key.trim() : "";
  if (tossUserKey.length === 0) {
    throw new HttpError(400, "TOSS_USER_KEY_NOT_FOUND", "toss_user_key not found");
  }

  const data = await sendMessage(ctx, tossUserKey, requireEnv(ctx.env, "TOSS_SMART_MESSAGE_TEMPLATE_CODE"), {
    date,
    screenName,
  });
  return jsonResponse(ctx, { success: true, data, requestId: ctx.requestId });
}

function readPositiveIntegerEnv(env: Env, key: keyof Env, fallbackValue: number): number {
  const rawValue = readTrimmedEnv(env, key);
  if (rawValue.length === 0) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function getPromotionRetryMaxAttempts(env: Env): number {
  return readPositiveIntegerEnv(env, "BENEFIT_PROMOTION_RETRY_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
}

function resolvePromotionRetryDelayMs(env: Env, attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 0) {
    throw new Error("attemptCount_must_be_non_negative_integer");
  }
  const initialDelayMs = readPositiveIntegerEnv(
    env,
    "BENEFIT_PROMOTION_RETRY_INITIAL_DELAY_MS",
    DEFAULT_INITIAL_DELAY_MS,
  );
  const maxDelayMs = readPositiveIntegerEnv(env, "BENEFIT_PROMOTION_RETRY_MAX_DELAY_MS", DEFAULT_MAX_DELAY_MS);
  return Math.min(initialDelayMs * BACKOFF_MULTIPLIER ** attemptCount, maxDelayMs);
}

function resolveNextPromotionRetryAt(env: Env, attemptCount: number, now = new Date()): string {
  return new Date(now.getTime() + resolvePromotionRetryDelayMs(env, attemptCount)).toISOString();
}

function isFutureIso(value: string | null, now = new Date()): boolean {
  if (value == null) {
    return false;
  }
  const parsedTime = Date.parse(value);
  return Number.isFinite(parsedTime) && parsedTime > now.getTime();
}

function readStatus(value: unknown): BenefitPromotionPayoutStatus {
  if (value === "pending" || value === "success" || value === "failed") {
    return value;
  }
  throw new Error("payout_status_invalid");
}

function parseBenefitPromotionRpcResult(data: unknown): BenefitPromotionRpcResult {
  if (!isRecord(data)) {
    throw new Error("benefit_promotion_rpc_result_invalid");
  }
  return {
    canExecute: readBoolean(data.canExecute, "canExecute"),
    reason: readNullableString(data.reason, "reason") ?? undefined,
    status: readStatus(data.status),
    payoutId: readString(data.payoutId, "payoutId"),
    redeemRequestId: readString(data.redeemRequestId, "redeemRequestId"),
    promotionCode: readNullableString(data.promotionCode, "promotionCode") ?? undefined,
    promotionKey: readNullableString(data.promotionKey, "promotionKey") ?? undefined,
    tossPointAmount: readInteger(data.tossPointAmount, "tossPointAmount"),
    redeemedMoney: data.redeemedMoney == null ? undefined : readInteger(data.redeemedMoney, "redeemedMoney"),
    restoredMoney: data.restoredMoney == null ? undefined : readInteger(data.restoredMoney, "restoredMoney"),
    moneyBalance: readInteger(data.moneyBalance, "moneyBalance"),
    promotionAttemptCount:
      data.promotionAttemptCount == null ? undefined : readInteger(data.promotionAttemptCount, "promotionAttemptCount"),
    nextPromotionRetryAt: readNullableString(data.nextPromotionRetryAt, "nextPromotionRetryAt"),
    tossErrorCode: readNullableString(data.tossErrorCode, "tossErrorCode"),
    tossErrorMessage: readNullableString(data.tossErrorMessage, "tossErrorMessage"),
    completedAt: readNullableString(data.completedAt, "completedAt"),
  };
}

function parseBenefitPromotionTarget(
  payout: Record<string, unknown>,
  wallet: Record<string, unknown>,
  tossAuthLink: Record<string, unknown>,
): BenefitPromotionExecutionTarget {
  return {
    userId: readString(payout.user_id, "userId"),
    payoutId: readString(payout.id, "payoutId"),
    redeemRequestId: readString(payout.redeem_request_id, "redeemRequestId"),
    promotionCode: readString(payout.promotion_code, "promotionCode"),
    promotionKey: readNullableString(payout.toss_promotion_key, "promotionKey"),
    promotionKeyExpiresAt: readNullableString(payout.toss_promotion_key_expires_at, "promotionKeyExpiresAt"),
    promotionAttemptCount: readInteger(payout.promotion_attempt_count, "promotionAttemptCount"),
    nextPromotionRetryAt: readNullableString(payout.next_promotion_retry_at, "nextPromotionRetryAt"),
    status: readStatus(payout.status),
    tossPointAmount: readInteger(payout.toss_point_amount, "tossPointAmount"),
    redeemedMoney: readInteger(payout.redeemed_money, "redeemedMoney"),
    moneyBalance: readInteger(wallet.money_balance, "moneyBalance"),
    tossUserKey: readString(tossAuthLink.toss_user_key, "tossUserKey"),
  };
}

async function readBenefitPromotionExecutionTarget(
  client: SupabaseRestClient,
  params: { readonly userId: string; readonly payoutId: string; readonly redeemRequestId: string },
): Promise<BenefitPromotionExecutionTarget> {
  const payout = await client.maybeSingle<Record<string, unknown>>(
    "benefit_toss_point_payouts",
    "id,user_id,redeem_request_id,promotion_code,redeemed_money,toss_point_amount,toss_promotion_key,toss_promotion_key_expires_at,promotion_attempt_count,next_promotion_retry_at,status",
    {
      id: `eq.${params.payoutId}`,
      user_id: `eq.${params.userId}`,
      redeem_request_id: `eq.${params.redeemRequestId}`,
    },
  );
  if (payout == null) {
    throw new Error("payout_not_found");
  }

  const wallet = await client.maybeSingle<Record<string, unknown>>("benefit_wallets", "money_balance", {
    user_id: `eq.${params.userId}`,
  });
  if (wallet == null) {
    throw new Error("wallet_not_found");
  }

  const tossAuthLink = await client.maybeSingle<Record<string, unknown>>("toss_auth_links", "toss_user_key", {
    auth_user_id: `eq.${params.userId}`,
  });
  if (tossAuthLink == null) {
    throw new Error("toss_user_key_not_found");
  }
  return parseBenefitPromotionTarget(payout, wallet, tossAuthLink);
}

async function benefitRpc(
  client: SupabaseRestClient,
  name: string,
  payload: Record<string, unknown>,
): Promise<BenefitPromotionRpcResult> {
  return parseBenefitPromotionRpcResult(await client.rpc(name, payload));
}

async function getPromotionRewardKey(ctx: RequestContext, tossUserKey: string): Promise<string> {
  const data = await tossMtlsRequest(
    ctx,
    `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/promotion/execute-promotion/get-key`,
    {
      method: "POST",
      headers: { "x-toss-user-key": tossUserKey },
      body: JSON.stringify({}),
    },
  );
  const envelope = readSuccessPayload(data);
  const key = envelope == null ? null : readNullableString(envelope.key, "key");
  if (key == null) {
    throw new TossPromotionRequestError("UNKNOWN_TOSS_ERROR", "Toss promotion key missing");
  }
  return key;
}

async function executePromotionReward(
  ctx: RequestContext,
  params: { readonly tossUserKey: string; readonly promotionCode: string; readonly key: string; readonly amount: number },
): Promise<void> {
  const data = await tossMtlsRequest(
    ctx,
    `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/promotion/execute-promotion`,
    {
      method: "POST",
      headers: { "x-toss-user-key": params.tossUserKey },
      body: JSON.stringify({
        promotionCode: params.promotionCode,
        key: params.key,
        amount: params.amount,
      }),
    },
  );
  const failure = readTossFailurePayload(data);
  if (failure != null) {
    throw new TossPromotionRequestError(failure.errorCode ?? "UNKNOWN_TOSS_ERROR", failure.error);
  }
}

async function readPromotionExecutionResult(
  ctx: RequestContext,
  params: { readonly tossUserKey: string; readonly promotionCode: string; readonly key: string },
): Promise<"SUCCESS" | "PENDING" | "FAILED"> {
  const data = await tossMtlsRequest(
    ctx,
    `${tossBaseUrl(ctx.env)}/api-partner/v1/apps-in-toss/promotion/execution-result`,
    {
      method: "POST",
      headers: { "x-toss-user-key": params.tossUserKey },
      body: JSON.stringify({
        promotionCode: params.promotionCode,
        key: params.key,
      }),
    },
  );
  const envelope = readSuccessPayload(data);
  const success = envelope?.success;
  if (success === "SUCCESS" || success === "PENDING" || success === "FAILED") {
    return success;
  }
  throw new TossPromotionRequestError("UNKNOWN_TOSS_ERROR", "Toss execution status invalid");
}

function normalizeTossPromotionError(error: unknown): { readonly errorCode: string; readonly message: string } {
  if (error instanceof TossPromotionRequestError) {
    return { errorCode: error.errorCode, message: error.message };
  }
  if (error instanceof HttpError) {
    return { errorCode: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { errorCode: "TOSS_PROMOTION_ERROR", message: error.message };
  }
  return { errorCode: "TOSS_PROMOTION_ERROR", message: "Toss promotion request failed" };
}

function isPromotionKeyUsable(target: BenefitPromotionExecutionTarget): boolean {
  return target.promotionKey != null && target.promotionKeyExpiresAt != null && isFutureIso(target.promotionKeyExpiresAt);
}

function resolveKeyExpiresAt(issuedAt: Date): string {
  return new Date(issuedAt.getTime() + DEFAULT_PROMOTION_KEY_TTL_MS).toISOString();
}

function toBenefitResult(
  rpcResult: BenefitPromotionRpcResult,
  success: boolean,
  reason?: string,
): ExecuteBenefitPromotionResult {
  return {
    success,
    status: rpcResult.status,
    reason,
    payoutId: rpcResult.payoutId,
    redeemRequestId: rpcResult.redeemRequestId,
    tossPointAmount: rpcResult.tossPointAmount,
    moneyBalance: rpcResult.moneyBalance,
    nextPromotionRetryAt: rpcResult.nextPromotionRetryAt,
    tossErrorCode: rpcResult.tossErrorCode,
    tossErrorMessage: rpcResult.tossErrorMessage,
    restoredMoney: rpcResult.restoredMoney,
  };
}

function resolveRetryTimestamp(env: Env, promotionAttemptCount: number, now = new Date()): string | null {
  if (promotionAttemptCount >= getPromotionRetryMaxAttempts(env)) {
    return null;
  }
  return resolveNextPromotionRetryAt(env, promotionAttemptCount, now);
}

async function restorePromotionFailure(
  client: SupabaseRestClient,
  target: BenefitPromotionExecutionTarget,
  errorCode: string,
  errorMessage: string,
  reason: string,
): Promise<ExecuteBenefitPromotionResult> {
  const restoredResult = await benefitRpc(client, "restore_benefit_toss_promotion_failure", {
    p_user_id: target.userId,
    p_payout_id: target.payoutId,
    p_redeem_request_id: target.redeemRequestId,
    p_error_code: errorCode,
    p_error_message: errorMessage,
  });
  return toBenefitResult(restoredResult, false, reason);
}

async function markPromotionRetryOrPending(
  ctx: RequestContext,
  client: SupabaseRestClient,
  target: BenefitPromotionExecutionTarget,
  beginResult: BenefitPromotionRpcResult,
  errorCode: string,
  errorMessage: string,
  reason: string,
): Promise<ExecuteBenefitPromotionResult> {
  const promotionAttemptCount = beginResult.promotionAttemptCount ?? target.promotionAttemptCount + 1;
  const nextPromotionRetryAt = resolveRetryTimestamp(ctx.env, promotionAttemptCount);
  const retryResult = await benefitRpc(client, "mark_benefit_toss_promotion_retry", {
    p_user_id: target.userId,
    p_payout_id: target.payoutId,
    p_redeem_request_id: target.redeemRequestId,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_next_promotion_retry_at: nextPromotionRetryAt,
  });
  return toBenefitResult(
    retryResult,
    false,
    nextPromotionRetryAt == null ? "promotion_retry_max_attempts_reached" : reason,
  );
}

async function handlePromotionFailure(
  ctx: RequestContext,
  client: SupabaseRestClient,
  target: BenefitPromotionExecutionTarget,
  beginResult: BenefitPromotionRpcResult,
  errorCode: string,
  errorMessage: string,
  reason: string,
): Promise<ExecuteBenefitPromotionResult> {
  if (RESTORABLE_TOSS_ERROR_CODES.has(errorCode)) {
    return restorePromotionFailure(client, target, errorCode, errorMessage, reason);
  }
  return markPromotionRetryOrPending(ctx, client, target, beginResult, errorCode, errorMessage, reason);
}

async function resolvePromotionKey(
  ctx: RequestContext,
  target: BenefitPromotionExecutionTarget,
): Promise<{ readonly key: string; readonly issuedAt: string; readonly expiresAt: string }> {
  if (isPromotionKeyUsable(target)) {
    return {
      key: target.promotionKey ?? "",
      issuedAt: new Date().toISOString(),
      expiresAt: target.promotionKeyExpiresAt ?? "",
    };
  }

  const issuedAt = new Date();
  return {
    key: await getPromotionRewardKey(ctx, target.tossUserKey),
    issuedAt: issuedAt.toISOString(),
    expiresAt: resolveKeyExpiresAt(issuedAt),
  };
}

async function executePromotionAttempt(
  ctx: RequestContext,
  client: SupabaseRestClient,
  target: BenefitPromotionExecutionTarget,
  shouldForce: boolean,
): Promise<ExecuteBenefitPromotionResult> {
  const key = await resolvePromotionKey(ctx, target);
  const beginResult = await benefitRpc(client, "begin_benefit_toss_promotion_attempt", {
    p_user_id: target.userId,
    p_payout_id: target.payoutId,
    p_redeem_request_id: target.redeemRequestId,
    p_promotion_key: key.key,
    p_key_issued_at: key.issuedAt,
    p_key_expires_at: key.expiresAt,
    p_processing_retry_at: resolveNextPromotionRetryAt(ctx.env, target.promotionAttemptCount),
    p_force: shouldForce,
  });

  if (beginResult.canExecute !== true) {
    return toBenefitResult(beginResult, false, beginResult.reason ?? "not_executable");
  }

  try {
    await executePromotionReward(ctx, {
      tossUserKey: target.tossUserKey,
      promotionCode: target.promotionCode,
      key: key.key,
      amount: target.tossPointAmount,
    });
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    if (failure.errorCode === DUPLICATE_KEY_ERROR_CODE && !shouldForce) {
      return executePromotionAttempt(
        ctx,
        client,
        {
          ...target,
          promotionKey: null,
          promotionKeyExpiresAt: null,
          promotionAttemptCount: beginResult.promotionAttemptCount ?? target.promotionAttemptCount + 1,
        },
        true,
      );
    }
    return handlePromotionFailure(
      ctx,
      client,
      target,
      beginResult,
      failure.errorCode,
      failure.message,
      "execute_promotion_failed",
    );
  }

  try {
    const executionStatus = await readPromotionExecutionResult(ctx, {
      tossUserKey: target.tossUserKey,
      promotionCode: target.promotionCode,
      key: key.key,
    });
    if (executionStatus === "SUCCESS") {
      const successResult = await benefitRpc(client, "complete_benefit_toss_promotion_success", {
        p_user_id: target.userId,
        p_payout_id: target.payoutId,
        p_redeem_request_id: target.redeemRequestId,
      });
      return toBenefitResult(successResult, true, "promotion_success");
    }
    if (executionStatus === "FAILED") {
      return restorePromotionFailure(
        client,
        target,
        "TOSS_PROMOTION_FAILED",
        "Toss promotion execution result is FAILED",
        "execution_result_failed",
      );
    }
    return markPromotionRetryOrPending(
      ctx,
      client,
      target,
      beginResult,
      "TOSS_PROMOTION_PENDING",
      "Toss promotion execution result is PENDING",
      "execution_result_pending",
    );
  } catch (error: unknown) {
    const failure = normalizeTossPromotionError(error);
    return handlePromotionFailure(
      ctx,
      client,
      target,
      beginResult,
      failure.errorCode,
      failure.message,
      "execution_result_read_failed",
    );
  }
}

async function executeBenefitPromotion(
  ctx: RequestContext,
  client: SupabaseRestClient,
  params: { readonly userId: string; readonly payoutId: string; readonly redeemRequestId: string },
): Promise<ExecuteBenefitPromotionResult> {
  const target = await readBenefitPromotionExecutionTarget(client, params);
  if (target.tossPointAmount > PER_REQUEST_TOSS_POINT_LIMIT) {
    return restorePromotionFailure(
      client,
      target,
      "4114",
      "Toss point amount exceeds per-request limit",
      "per_request_limit_exceeded",
    );
  }
  if (target.status !== "pending") {
    return {
      success: target.status === "success",
      status: target.status,
      reason: "payout_already_finalized",
      payoutId: target.payoutId,
      redeemRequestId: target.redeemRequestId,
      tossPointAmount: target.tossPointAmount,
      moneyBalance: target.moneyBalance,
      nextPromotionRetryAt: target.nextPromotionRetryAt,
    };
  }
  if (isFutureIso(target.nextPromotionRetryAt)) {
    return {
      success: false,
      status: target.status,
      reason: "retry_not_due",
      payoutId: target.payoutId,
      redeemRequestId: target.redeemRequestId,
      tossPointAmount: target.tossPointAmount,
      moneyBalance: target.moneyBalance,
      nextPromotionRetryAt: target.nextPromotionRetryAt,
    };
  }
  return executePromotionAttempt(ctx, client, target, false);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handleBenefitPromotion(ctx: RequestContext): Promise<Response> {
  const authHeader = ctx.request.headers.get("Authorization");
  const token = readBearerToken(authHeader);
  const secret = readTrimmedEnv(ctx.env, "BENEFIT_BFF_INTERNAL_SECRET");
  if (secret.length === 0 || token.length === 0 || !constantTimeEqual(token, secret)) {
    throw new HttpError(401, "UNAUTHORIZED", "unauthorized_internal_request");
  }

  const body = await readJsonBody(ctx.request);
  if (!isRecord(body)) {
    throw new HttpError(400, "INVALID_BENEFIT_PROMOTION_PAYLOAD", "invalid_benefit_promotion_payload");
  }
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
  const redeemRequestId = typeof body.redeemRequestId === "string" ? body.redeemRequestId.trim() : "";
  if (!isUuid(userId) || !isUuid(payoutId) || redeemRequestId.length === 0) {
    throw new HttpError(400, "INVALID_BENEFIT_PROMOTION_PAYLOAD", "invalid_benefit_promotion_payload");
  }

  const result = await executeBenefitPromotion(ctx, supabase(ctx), { userId, payoutId, redeemRequestId });
  return jsonResponse(ctx, { ...result, requestId: ctx.requestId }, result.success ? 200 : 202);
}

async function deleteUserData(client: SupabaseRestClient, authUserId: string): Promise<void> {
  await client.deleteRows("portfolio_history", { user_id: `eq.${authUserId}` });
  await client.deleteRows("portfolios", { user_id: `eq.${authUserId}` });
  await client.deleteUser(authUserId);
}

async function handleTossWithdrawalWebhook(ctx: RequestContext): Promise<Response> {
  const username = readTrimmedEnv(ctx.env, "TOSS_WEBHOOK_USER");
  const password = readTrimmedEnv(ctx.env, "TOSS_WEBHOOK_PASSWORD");
  if (!hasValidBasicAuth(ctx.request.headers.get("Authorization"), username, password)) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const body = await readJsonBody(ctx.request);
  const userId = isRecord(body) && typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (userId.length === 0) {
    throw new HttpError(400, "MISSING_USER_ID", "Missing user_id in request body. Send { \"user_id\": \"Supabase user UUID\" }.");
  }

  await deleteUserData(supabase(ctx), userId);
  return jsonResponse(ctx, { success: true });
}

async function resolveAuthUserIdByTossUserKey(client: SupabaseRestClient, userKey: string): Promise<string | null> {
  const mapping = await client.maybeSingle<{ auth_user_id?: string | null }>("toss_accounts", "auth_user_id", {
    toss_user_key: `eq.${userKey}`,
  });
  return typeof mapping?.auth_user_id === "string" && mapping.auth_user_id.trim().length > 0
    ? mapping.auth_user_id
    : null;
}

async function handleTossDisconnectWebhook(ctx: RequestContext): Promise<Response> {
  const username = readTrimmedEnv(ctx.env, "TOSS_WEBHOOK_USER");
  const password = readTrimmedEnv(ctx.env, "TOSS_WEBHOOK_PASSWORD");
  if (!hasValidBasicAuth(ctx.request.headers.get("Authorization"), username, password)) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const body = await readJsonBody(ctx.request);
  if (!isRecord(body)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid payload");
  }
  const userKey = typeof body.userKey === "number" || typeof body.userKey === "string" ? String(body.userKey).trim() : "";
  const referrer = typeof body.referrer === "string" ? body.referrer.trim() : "";
  if (userKey.length === 0 || !TOSS_DISCONNECT_REFERRERS.includes(referrer as TossDisconnectReferrer)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid payload");
  }

  const client = supabase(ctx);
  const authUserId = await resolveAuthUserIdByTossUserKey(client, userKey);
  if (authUserId == null) {
    return jsonResponse(ctx, { success: true, action: "noop", requestId: ctx.requestId });
  }

  if (referrer === "UNLINK") {
    await client.rpc("rpc_toss_self_unlink", { target_user_id: authUserId });
    return jsonResponse(ctx, { success: true, action: "unlinked", requestId: ctx.requestId });
  }
  await deleteUserData(client, authUserId);
  return jsonResponse(ctx, { success: true, action: "withdrawn", requestId: ctx.requestId });
}

async function route(ctx: RequestContext): Promise<Response> {
  const { request, url } = ctx;
  if (request.method === "OPTIONS") {
    return emptyResponse(ctx);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse(ctx, { status: "ok", service: "btd-toss-bff-worker" });
  }

  if (request.method === "POST" && url.pathname === "/auth/toss/exchange") {
    return handleTossExchange(ctx);
  }
  if (request.method === "POST" && url.pathname === "/auth/toss/self-unlink") {
    return handleSelfUnlink(ctx);
  }
  if (request.method === "POST" && url.pathname === "/payment/toss/verify") {
    return handleTossPaymentVerify(ctx);
  }
  if (request.method === "POST" && url.pathname === "/payment/toss/iap-verify") {
    return handleTossIapVerify(ctx);
  }
  if (request.method === "POST" && url.pathname === "/internal/toss/messages/send") {
    return handleTossSmartMessage(ctx);
  }
  if (request.method === "POST" && url.pathname === "/benefits/toss-point/execute-promotion") {
    return handleBenefitPromotion(ctx);
  }
  if (request.method === "POST" && url.pathname === "/webhook/toss-member-withdrawal") {
    return handleTossWithdrawalWebhook(ctx);
  }
  if (request.method === "POST" && url.pathname === "/webhook/toss/disconnect") {
    return handleTossDisconnectWebhook(ctx);
  }

  return jsonResponse(ctx, { success: false, error: "Not found", requestId: ctx.requestId }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = request.headers.get("X-Correlation-ID")?.trim() || crypto.randomUUID();
    const ctx: RequestContext = {
      env,
      request,
      url: new URL(request.url),
      requestId,
    };

    try {
      return await route(ctx);
    } catch (error: unknown) {
      return errorResponse(ctx, error);
    }
  },
};
