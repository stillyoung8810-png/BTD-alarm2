import Fastify from "fastify";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const originalWebhookUserEnv = process.env.TOSS_WEBHOOK_USER;
const originalWebhookPasswordEnv = process.env.TOSS_WEBHOOK_PASSWORD;

process.env.TOSS_WEBHOOK_USER = "webhook-user";
process.env.TOSS_WEBHOOK_PASSWORD = "webhook-password";

const mockHandleTossDisconnect = vi.fn();
const ROUTE_TEST_TIMEOUT_MS = 15000;

vi.mock("../toss/tossDisconnectHandler", () => ({
  handleTossDisconnect: (...args: unknown[]) => mockHandleTossDisconnect(...args),
  TOSS_DISCONNECT_REFERRERS: [
    "UNLINK",
    "WITHDRAWAL_TERMS",
    "WITHDRAWAL_TOSS",
  ] as const,
}));

import {
  TOSS_DISCONNECT_PATH,
  tossDisconnectCallbackRoutes,
} from "./tossDisconnectCallbackRoute";

function createBasicAuthHeader(): string {
  return `Basic ${Buffer.from("webhook-user:webhook-password").toString("base64")}`;
}

describe("tossDisconnectCallbackRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleTossDisconnect.mockResolvedValue({ action: "unlinked" });
  });

  afterAll(() => {
    if (originalWebhookUserEnv == null) {
      delete process.env.TOSS_WEBHOOK_USER;
    } else {
      process.env.TOSS_WEBHOOK_USER = originalWebhookUserEnv;
    }

    if (originalWebhookPasswordEnv == null) {
      delete process.env.TOSS_WEBHOOK_PASSWORD;
    } else {
      process.env.TOSS_WEBHOOK_PASSWORD = originalWebhookPasswordEnv;
    }
  });

  it("Basic Auth 가 없으면 401을 반환한다", async () => {
    const app = Fastify({ logger: false });
    await app.register(tossDisconnectCallbackRoutes);

    const response = await app.inject({
      method: "POST",
      url: TOSS_DISCONNECT_PATH,
      payload: {
        userKey: "123",
        referrer: "UNLINK",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(mockHandleTossDisconnect).not.toHaveBeenCalled();

  }, ROUTE_TEST_TIMEOUT_MS);

  it("유효한 Basic Auth 와 payload 면 handleTossDisconnect 를 호출한다", async () => {
    const app = Fastify({ logger: false });
    await app.register(tossDisconnectCallbackRoutes);

    const response = await app.inject({
      method: "POST",
      url: TOSS_DISCONNECT_PATH,
      headers: {
        authorization: createBasicAuthHeader(),
      },
      payload: {
        userKey: "123",
        referrer: "UNLINK",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      action: "unlinked",
    });
    expect(mockHandleTossDisconnect).toHaveBeenCalledWith(
      {
        userKey: "123",
        referrer: "UNLINK",
      },
      expect.objectContaining({
        info: expect.any(Function),
        warn: expect.any(Function),
        error: expect.any(Function),
      }),
    );

  }, ROUTE_TEST_TIMEOUT_MS);
});
