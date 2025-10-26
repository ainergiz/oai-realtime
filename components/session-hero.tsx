"use client";

import type { SessionStatus } from "../lib/session-types";
import { AudioOrb } from "./audio-orb";

type SessionHeroProps = {
  status: SessionStatus;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  onRecord: () => void;
  onStop: () => void;
};

export const SessionHero = ({
  status,
  inputAnalyser,
  outputAnalyser,
  onRecord,
  onStop,
}: SessionHeroProps) => {
  return (
    <header className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-sm font-semibold uppercase tracking-[0.55em] text-white/80">
          Delfa: Clinical Trial Recruitment
        </h1>
        <span className="text-xs hidden md:block uppercase tracking-[0.4em] text-emerald-200/80">
          Study: Mind Body Intervention for Chronic Migraine Headaches
        </span>
      </div>
      <AudioOrb
        inputAnalyser={inputAnalyser}
        outputAnalyser={outputAnalyser}
        active={status === "connected"}
      />
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRecord}
          disabled={status === "connecting" || status === "connected"}
          className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-zinc-950 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/40"
        >
          {status === "connecting" ? "Connecting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={status === "idle" || status === "error"}
          className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Stop
        </button>
      </div>
      <p className="text-xs uppercase tracking-[0.35em] text-white/60">
        Status:{" "}
        <span
          className={
            status === "connected"
              ? "text-emerald-200"
              : status === "connecting"
                ? "text-yellow-200"
                : status === "error"
                  ? "text-rose-200"
                  : "text-white/70"
          }
        >
          {status}
        </span>
      </p>
    </header>
  );
};
