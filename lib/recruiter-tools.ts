"use client";

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import { matchStudySections, STUDY_INFO } from "./study-info";

export type EligibilitySummary = {
  eligibility: "eligible" | "ineligible" | "review";
  reasons: string[];
};

const guardrailStateSchema = z.object({
  state: z.enum([
    "CONSENT_PENDING",
    "CONSENT_DENIED",
    "AGE_GATE",
    "SCREENING",
    "TRIAL_INFO",
    "SCHEDULE",
    "HUMAN_HANDOFF",
    "END",
  ]),
  action: z.enum([
    "ASK",
    "ANSWER",
    "REFUSE",
    "ESCALATE_CRISIS",
    "CONFIRM",
    "SUMMARIZE",
    "GOODBYE",
  ]),
  pii_requested: z
    .array(
      z.enum([
        "NAME",
        "EMAIL",
        "PHONE",
        "ZIP",
        "CITY",
        "STATE",
        "AGE",
        "DOB_MONTH_YEAR",
      ]),
    )
    .default([]),
  violations: z
    .array(
      z.enum([
        "ADVICE_MEDICAL",
        "COLLECT_EXCESS_PII",
        "MINOR_USER",
        "EMERGENCY_SIGNAL",
        "CLAIM_EFFICACY",
        "NO_CONSENT",
        "OUT_OF_SCOPE",
      ]),
    )
    .default([]),
  risk_notes: z.string().optional(),
});

export type GuardrailStateUpdate = z.infer<typeof guardrailStateSchema>;

const HIGH_RISK_VIOLATIONS = new Set<
  GuardrailStateUpdate["violations"][number]
>(["EMERGENCY_SIGNAL", "MINOR_USER", "NO_CONSENT"]);

export type ModerationRecord = {
  phase: "user_input" | "assistant_plan";
  text: string;
  flagged?: boolean;
  categories?: Record<string, unknown>;
  error?: string;
  timestamp: number;
};

type CreateRecruiterToolsOptions = {
  setEligibilitySummary: (summary: EligibilitySummary) => void;
  onGuardrailUpdate: (payload: GuardrailStateUpdate) => void;
  onGuardrailViolation?: (payload: GuardrailStateUpdate) => void;
  onModerationResult?: (record: ModerationRecord) => void;
};

export const createRecruiterTools = ({
  setEligibilitySummary,
  onGuardrailUpdate,
  onGuardrailViolation,
  onModerationResult,
}: CreateRecruiterToolsOptions) => {
  const guardrailStateTool = tool({
    name: "guardrail_state",
    description:
      "Side-channel state/update the app must enforce. MUST be called every assistant turn before speaking.",
    parameters: guardrailStateSchema,
    async execute(rawPayload) {
      const parsed = guardrailStateSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return {
          acknowledged: false,
          error: "invalid_guardrail_state_payload",
        };
      }

      const payload = {
        ...parsed.data,
        pii_requested: parsed.data.pii_requested ?? [],
        violations: parsed.data.violations ?? [],
      };

      onGuardrailUpdate(payload);

      if (
        onGuardrailViolation &&
        payload.violations.some((violation) =>
          HIGH_RISK_VIOLATIONS.has(violation),
        )
      ) {
        onGuardrailViolation(payload);
      }

      return { acknowledged: true };
    },
  });

  const recordEligibilityTool = tool({
    name: "record_eligibility",
    description:
      "Use this to log the participant's eligibility outcome once screening is complete.",
    parameters: z.object({
      eligibility: z.enum(["eligible", "ineligible", "review"]),
      reasons: z.array(z.string()).min(1),
    }),
    async execute({ eligibility, reasons }) {
      const cleanedReasons =
        reasons?.map((reason) => reason.trim()).filter(Boolean) ?? [];
      setEligibilitySummary({
        eligibility,
        reasons:
          cleanedReasons.length > 0 ? cleanedReasons : ["No reasons provided."],
      });
      return {
        recorded: true,
      };
    },
  });

  const moderationCheckTool = tool({
    name: "moderation_check",
    description:
      "Send text to the server-side moderation endpoint before delivering high-stakes responses or when user input seems risky.",
    parameters: z.object({
      text: z.string().min(1),
      phase: z.enum(["user_input", "assistant_plan"]),
    }),
    async execute({ text, phase }) {
      const payload = { text: text.slice(0, 8000), phase };
      try {
        const response = await fetch("/api/moderation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          onModerationResult?.({
            phase,
            text: payload.text,
            error: data?.error ?? "moderation_failed",
            timestamp: Date.now(),
          });
          return {
            moderated: false,
            error: data?.error ?? "moderation_failed",
          };
        }

        const result = data?.result;
        const moderationEntry = Array.isArray(result?.results)
          ? result.results[0]
          : null;
        const flagged = Boolean(moderationEntry?.flagged);
        const categories = moderationEntry?.categories ?? undefined;

        onModerationResult?.({
          phase,
          text: payload.text,
          flagged,
          categories,
          timestamp: Date.now(),
        });

        return {
          moderated: true,
          flagged,
          categories,
        };
      } catch (_error) {
        onModerationResult?.({
          phase,
          text: payload.text,
          error: "moderation_unreachable",
          timestamp: Date.now(),
        });
        return {
          moderated: false,
          error: "moderation_unreachable",
        };
      }
    },
  });

  const lookupInfoTool = tool({
    name: "lookup_info",
    description:
      "Retrieve authoritative details about the Delfa clinical trial, including status, eligibility, interventions, contacts, and outcomes. Call this whenever the user asks for study information not already provided in the prompt.",
    parameters: z.object({
      question: z
        .string()
        .min(1)
        .describe("The user's study-related question or topic to look up."),
    }),
    async execute({ question }) {
      const sections = matchStudySections(question).map((section) => ({
        title: section.title,
        content: section.content,
      }));

      const includeRawRecord = /\b(raw|json|full record)\b/i.test(question);
      const response: Record<string, unknown> = {
        sections,
        matched_sections: sections.map((section) => section.title),
        last_updated: STUDY_INFO.lastUpdated,
        source: STUDY_INFO.source,
      };

      if (includeRawRecord) {
        response.raw = STUDY_INFO;
      }

      return response;
    },
  });

  return [
    guardrailStateTool,
    recordEligibilityTool,
    moderationCheckTool,
    lookupInfoTool,
  ];
};
