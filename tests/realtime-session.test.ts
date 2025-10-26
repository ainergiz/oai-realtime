import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/realtime-session/route";

const REALTIME_URL = "https://api.openai.com/v1/realtime/client_secrets";

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
  process.env = { ...ORIGINAL_ENV };
};

const mockResponse = (body: unknown, init: ResponseInit) =>
  new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    init,
  );

describe("POST /api/realtime-session", () => {
  beforeAll(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST();
    expect(response.status).toBe(500);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Missing OPENAI_API_KEY");
  });

  it("bubbles up API errors gracefully", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const mockedFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ error: "unauthorized" }, {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST();

    expect(mockedFetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(401);

    const payload = (await response.json()) as {
      error: string;
      details: unknown;
    };
    expect(payload.error).toContain("Failed to create realtime client secret");
    expect(payload.details).toEqual({ error: "unauthorized" });
  });

  it("returns the client secret payload on success", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const mockBody = {
      id: "cs_123",
      object: "client_secret",
      created: 1,
      expires_at: 2,
      value: "secret",
    };

    const mockedFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(mockBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST();
    expect(mockedFetch).toHaveBeenCalledOnce();

    const fetchCall = mockedFetch.mock.calls[0];
    expect(fetchCall?.[0]).toBe(REALTIME_URL);
    const init = fetchCall?.[1] as RequestInit;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(init?.body && JSON.parse(init.body as string)).toEqual({
      session: {
        type: "realtime",
        model: process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini",
      },
    });

    const payload = (await response.json()) as {
      client_secret: string;
      client_secret_id: string;
      expires_at: number;
    };

    expect(response.status).toBe(200);
    expect(payload.client_secret).toBe("secret");
    expect(payload.client_secret_id).toBe("cs_123");
    expect(payload.expires_at).toBe(2);
  });

  it("returns 500 when fetch throws unexpectedly", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const response = await POST();
    expect(response.status).toBe(500);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Unexpected error");
  });

  it("gracefully handles non-JSON error payloads", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse("Upstream failure", {
        status: 502,
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await POST();
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error: string; details: unknown };
    expect(payload.error).toContain("Failed to create realtime client secret");
    expect(payload.details).toEqual({});
  });
});
