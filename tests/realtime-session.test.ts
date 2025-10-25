import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/realtime-session/route";

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

describe("POST /api/realtime-session", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_API_KEY) {
      process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_API_KEY) {
      process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
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
      new Response(JSON.stringify({ error: "unauthorized" }), {
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
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST();
    expect(mockedFetch).toHaveBeenCalledOnce();

    const fetchCall = mockedFetch.mock.calls[0];
    expect(fetchCall?.[0]).toBe(
      "https://api.openai.com/v1/realtime/client_secrets",
    );

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
});
