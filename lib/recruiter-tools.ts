"use client";

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import studyDetails from "../study_details.json";

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

const HIGH_RISK_VIOLATIONS = new Set<GuardrailStateUpdate["violations"][number]>([
  "EMERGENCY_SIGNAL",
  "MINOR_USER",
  "NO_CONSENT",
]);

type StudyDetails = typeof studyDetails;

const STUDY_DETAILS: StudyDetails = studyDetails;

const studyStatusModule = STUDY_DETAILS.protocolSection?.statusModule;
const studyIdentification = STUDY_DETAILS.protocolSection?.identificationModule;
const leadSponsor =
  STUDY_DETAILS.protocolSection?.sponsorCollaboratorsModule?.leadSponsor;
const descriptionModule = STUDY_DETAILS.protocolSection?.descriptionModule;
const conditionsModule = STUDY_DETAILS.protocolSection?.conditionsModule;
const designModule = STUDY_DETAILS.protocolSection?.designModule;
const outcomesModule = STUDY_DETAILS.protocolSection?.outcomesModule;
const eligibilityModule = STUDY_DETAILS.protocolSection?.eligibilityModule;
const contactsModule = STUDY_DETAILS.protocolSection?.contactsLocationsModule;

const formatList = (items: string[] | undefined, label?: string) => {
  if (!items || items.length === 0) {
    return label ? `${label}: not specified` : "not specified";
  }
  const body = items.map((item) => `- ${item}`).join("\n");
  return label ? `${label}:\n${body}` : body;
};

const formatOutcomes = () => {
  const primary = outcomesModule?.primaryOutcomes ?? [];
  const secondary = outcomesModule?.secondaryOutcomes ?? [];

  const formatOutcomeBlock = (
    outcomes: typeof primary,
    heading: string,
  ) => {
    if (!outcomes.length) {
      return `${heading}: not reported.`;
    }
    const lines = outcomes.map((outcome) => {
      const measure = outcome.measure ?? "Unspecified measure";
      const timeFrame = outcome.timeFrame ? ` (${outcome.timeFrame})` : "";
      const description = outcome.description
        ? ` – ${outcome.description}`
        : "";
      return `- ${measure}${timeFrame}${description}`;
    });
    return `${heading}:\n${lines.join("\n")}`;
  };

  return [
    formatOutcomeBlock(primary, "Primary outcomes"),
    formatOutcomeBlock(secondary, "Secondary outcomes"),
  ]
    .filter(Boolean)
    .join("\n\n");
};

const formatEligibility = () => {
  const criteria = eligibilityModule?.eligibilityCriteria;
  if (!criteria) {
    return "Eligibility criteria not available.";
  }

  const lines = criteria
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.join("\n");
};

const formatContacts = () => {
  const contacts = contactsModule?.centralContacts ?? [];
  const officials = contactsModule?.overallOfficials ?? [];

  const contactLines = contacts.map((contact) => {
    const parts = [contact.name, contact.role, contact.phone, contact.email]
      .filter(Boolean)
      .join(" | ");
    return `- ${parts}`;
  });

  const officialLines = officials.map((official) => {
    const parts = [
      official.name,
      official.role,
      official.affiliation,
    ]
      .filter(Boolean)
      .join(" | ");
    return `- ${parts}`;
  });

  const sections: string[] = [];
  sections.push(
    contactLines.length
      ? `Central contacts:\n${contactLines.join("\n")}`
      : "Central contacts: not listed.",
  );
  sections.push(
    officialLines.length
      ? `Study officials:\n${officialLines.join("\n")}`
      : "Study officials: not listed.",
  );

  return sections.join("\n\n");
};

const formatLocations = () => {
  const locations = contactsModule?.locations ?? [];
  if (!locations.length) {
    return "Study locations: not reported.";
  }

  return [
    "Study locations:",
    ...locations.map((location) => {
      const parts = [
        location.facility,
        location.city,
        location.state,
        location.country,
      ]
        .filter(Boolean)
        .join(", ");
      const status = location.status ? ` – Status: ${location.status}` : "";
      return `- ${parts}${status}`;
    }),
  ].join("\n");
};

const formatInterventions = () => {
  const interventions =
    STUDY_DETAILS.protocolSection?.armsInterventionsModule?.interventions ?? [];
  if (!interventions.length) {
    return "Interventions are not described.";
  }

  const lines = interventions.map((intervention) => {
    const description = intervention.description
      ? ` – ${intervention.description}`
      : "";
    return `- ${intervention.type}: ${intervention.name}${description}`;
  });

  return ["Interventions:", ...lines].join("\n");
};

const buildStudySections = (question: string) => {
  const normalized = question.toLowerCase();
  const sections = [
    {
      name: "overview",
      title: "Overview",
      keywords: [
        "overview",
        "study",
        "trial",
        "what",
        "summary",
        "title",
      ],
      content: [
        `Official title: ${
          studyIdentification?.officialTitle ?? "Not specified"
        }`,
        `Brief title: ${studyIdentification?.briefTitle ?? "Not specified"}`,
        `ClinicalTrials.gov ID: ${studyIdentification?.nctId ?? "Unknown"}`,
        `Sponsor: ${leadSponsor?.name ?? "Not specified"}`,
        descriptionModule?.briefSummary
          ? `Summary: ${descriptionModule.briefSummary}`
          : "Summary: not provided.",
        conditionsModule?.conditions?.length
          ? formatList(conditionsModule.conditions, "Conditions")
          : "Conditions: not specified.",
        designModule?.studyType
          ? `Study type: ${designModule.studyType}`
          : "Study type: not specified.",
      ].join("\n"),
    },
    {
      name: "status",
      title: "Status & Timeline",
      keywords: ["status", "timeline", "start", "completion", "recruit", "date"],
      content: [
        `Overall status: ${studyStatusModule?.overallStatus ?? "Unknown"}`,
        studyStatusModule?.statusVerifiedDate
          ? `Status verified: ${studyStatusModule.statusVerifiedDate}`
          : undefined,
        studyStatusModule?.startDateStruct?.date
          ? `Start date (${studyStatusModule.startDateStruct.type}): ${studyStatusModule.startDateStruct.date}`
          : undefined,
        studyStatusModule?.primaryCompletionDateStruct?.date
          ? `Primary completion date (${studyStatusModule.primaryCompletionDateStruct.type}): ${studyStatusModule.primaryCompletionDateStruct.date}`
          : undefined,
        studyStatusModule?.completionDateStruct?.date
          ? `Study completion date (${studyStatusModule.completionDateStruct.type}): ${studyStatusModule.completionDateStruct.date}`
          : undefined,
        designModule?.enrollmentInfo?.count
          ? `Planned enrollment: ${designModule.enrollmentInfo.count} (${designModule.enrollmentInfo.type ?? ""})`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      name: "eligibility",
      title: "Eligibility",
      keywords: ["eligibility", "inclusion", "exclusion", "criteria"],
      content: formatEligibility(),
    },
    {
      name: "intervention",
      title: "Intervention",
      keywords: ["intervention", "treatment", "arm"],
      content: formatInterventions(),
    },
    {
      name: "outcomes",
      title: "Outcomes",
      keywords: ["outcome", "measure", "endpoint"],
      content: formatOutcomes(),
    },
    {
      name: "contacts",
      title: "Contacts",
      keywords: ["contact", "phone", "email", "investigator"],
      content: formatContacts(),
    },
    {
      name: "locations",
      title: "Locations",
      keywords: ["location", "site", "where"],
      content: formatLocations(),
    },
  ];

  const matched = sections.filter((section) =>
    section.keywords.some((keyword) => normalized.includes(keyword)),
  );

  if (matched.length > 0) {
    return matched;
  }

  // Default to overview and status if nothing matched so the agent always gets a useful payload.
  return sections.filter((section) =>
    ["overview", "status"].includes(section.name),
  );
};

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
          cleanedReasons.length > 0
            ? cleanedReasons
            : ["No reasons provided."],
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
          return { moderated: false, error: data?.error ?? "moderation_failed" };
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
      const sections = buildStudySections(question).map((section) => ({
        title: section.title,
        content: section.content,
      }));

      const includeRawRecord = /\b(raw|json|full record)\b/i.test(question);
      const response: Record<string, unknown> = {
        sections,
        matched_sections: sections.map((section) => section.title),
        last_updated:
          studyStatusModule?.lastUpdatePostDateStruct?.date ??
          studyStatusModule?.statusVerifiedDate ??
          null,
        source: "study_details.json",
      };

      if (includeRawRecord) {
        response.raw = STUDY_DETAILS;
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
