"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { getMessageCopy } from "../lib/messages";
import type {
  EligibilitySummary,
  GuardrailStateUpdate,
  ModerationRecord,
} from "../lib/recruiter-tools";
import type { MessageItem, SessionStatus } from "../lib/session-types";

type ConversationPanelProps = {
  messageHistory: MessageItem[];
  guardrailState: GuardrailStateUpdate | null;
  latestModeration: ModerationRecord | null;
  eligibilitySummary: EligibilitySummary | null;
  status: SessionStatus;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export const ConversationPanel = ({
  messageHistory,
  guardrailState,
  latestModeration,
  eligibilitySummary,
  status,
  inputValue,
  onInputChange,
  onSubmit,
}: ConversationPanelProps) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messageHistory.length, guardrailState, latestModeration, eligibilitySummary]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-zinc-950/40 p-6">
      <h2 className="text-lg font-semibold text-white">Conversation</h2>

      <div
        ref={scrollContainerRef}
        className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-4"
      >
        {messageHistory.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Connect and start talking to see the transcript appear here.
          </p>
        ) : (
          messageHistory.map((item) => (
            <div
              key={item.itemId}
              className={`flex flex-col gap-1 rounded-xl p-3 ${
                item.role === "assistant"
                  ? "border border-emerald-300/40 bg-emerald-300/5 text-emerald-100"
                  : "border border-white/5 bg-white/5 text-zinc-100"
              }`}
            >
              <span className="text-xs uppercase tracking-[0.2em] text-white/60">
                {item.role}
              </span>
              <p className="text-sm leading-relaxed text-white/90">
                {getMessageCopy(item)}
              </p>
            </div>
          ))
        )}
      </div>

      {guardrailState ? (
        <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-4 text-amber-100">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">
              Guardrail Status
            </span>
            <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-100">
              {guardrailState.state}
            </span>
            <span className="text-xs uppercase tracking-[0.25em] text-amber-200/80">
              Action: {guardrailState.action}
            </span>
          </div>
          {guardrailState.violations.length > 0 ? (
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-amber-100/90">
              {guardrailState.violations.map((violation, index) => (
                <li key={`${violation}-${index}`}>{violation}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-amber-100/80">
              No violations reported for this turn.
            </p>
          )}
          {guardrailState.risk_notes ? (
            <p className="mt-2 text-xs text-amber-100/75">
              Notes: {guardrailState.risk_notes}
            </p>
          ) : null}
        </div>
      ) : null}

      {latestModeration ? (
        <div
          className={`rounded-xl border p-4 ${
            latestModeration.flagged
              ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
              : "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.2em]">
              Moderation ({latestModeration.phase})
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                latestModeration.flagged
                  ? "bg-rose-400/30 text-rose-100"
                  : "bg-emerald-300/30 text-emerald-100"
              }`}
            >
              {latestModeration.flagged ? "Flagged" : "Clear"}
            </span>
          </div>
          <p className="mt-2 text-xs opacity-80">
            {latestModeration.text.length > 140
              ? `${latestModeration.text.slice(0, 140)}…`
              : latestModeration.text}
          </p>
        </div>
      ) : null}

      {eligibilitySummary ? (
        <div className="rounded-xl border border-white/10 bg-black/50 p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
              Eligibility Status
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                eligibilitySummary.eligibility === "eligible"
                  ? "bg-emerald-400/20 text-emerald-200"
                  : eligibilitySummary.eligibility === "ineligible"
                    ? "bg-rose-400/20 text-rose-200"
                    : "bg-yellow-300/20 text-yellow-200"
              }`}
            >
              {eligibilitySummary.eligibility}
            </span>
          </div>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-zinc-200">
            {eligibilitySummary.reasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/40 p-4 sm:flex-row"
      >
        <div className="flex-1">
          <label htmlFor="text-input" className="sr-only">
            Send a text message
          </label>
          <input
            id="text-input"
            name="text"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Type a quick question..."
            className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
            disabled={status !== "connected"}
          />
        </div>
        <button
          type="submit"
          disabled={status !== "connected" || inputValue.trim() === ""}
          className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
        >
          Send
        </button>
      </form>
    </section>
  );
};
