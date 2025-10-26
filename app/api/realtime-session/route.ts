import { NextResponse } from "next/server";

const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";

type ClientSecretResponse = {
  id: string;
  object: string;
  created: number;
  expires_at: number;
  value: string;
};

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY server environment variable." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(OPENAI_REALTIME_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: DEFAULT_REALTIME_MODEL,
        },
      }),
    });

    if (!response.ok) {
      const errorResponse = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: "Failed to create realtime client secret.",
          details: errorResponse,
        },
        { status: response.status },
      );
    }

    const data = (await response.json()) as ClientSecretResponse;

    return NextResponse.json({
      client_secret: data.value,
      expires_at: data.expires_at,
      client_secret_id: data.id,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        error: "Unexpected error while creating realtime client secret.",
      },
      { status: 500 },
    );
  }
}
