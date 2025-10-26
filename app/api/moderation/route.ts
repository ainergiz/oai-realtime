import { NextResponse } from "next/server";

const MODERATION_URL = "https://api.openai.com/v1/moderations";

type ModerationRequestBody = {
  text?: string;
  phase?: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "missing_openai_api_key" },
      { status: 500 },
    );
  }

  let body: ModerationRequestBody;
  try {
    body = (await request.json()) as ModerationRequestBody;
  } catch (_error) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const phase = typeof body.phase === "string" ? body.phase : "unknown";

  if (!text.trim()) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }

  try {
    const moderationResponse = await fetch(MODERATION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: text.slice(0, 8000),
      }),
    });

    const moderationData = await moderationResponse.json();

    if (!moderationResponse.ok) {
      return NextResponse.json(
        {
          error: "moderation_failed",
          details: moderationData,
        },
        { status: moderationResponse.status },
      );
    }

    return NextResponse.json({
      phase,
      result: moderationData,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        error: "moderation_unreachable",
      },
      { status: 500 },
    );
  }
}
