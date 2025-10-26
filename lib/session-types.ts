import type { RealtimeItem } from "@openai/agents/realtime";

export type SessionStatus = "idle" | "connecting" | "connected" | "error";

export type MessageItem = Extract<RealtimeItem, { type: "message" }>;
