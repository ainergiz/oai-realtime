import { AudioOrb } from "./audio-orb";
import type { SessionStatus } from "../lib/session-types";

type SessionHeroProps = {
  status: SessionStatus;
  modelName: string;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
};

export const SessionHero = ({
  status,
  modelName,
  inputAnalyser,
  outputAnalyser,
}: SessionHeroProps) => {
  return (
    <header className="flex flex-col gap-8 lg:flex-row lg:items-center">
      <div className="flex flex-1 flex-col gap-3">
        <span className="text-sm uppercase tracking-[0.3em] text-emerald-300/80">
          OpenAI Realtime Quickstart
        </span>
        <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
          Talk to your realtime assistant
        </h1>
        <p className="text-base text-zinc-300 sm:text-lg">
          Click connect to create a short-lived client secret, share your mic,
          and start a conversation with the{" "}
          <span className="font-semibold text-emerald-300">{modelName}</span>{" "}
          model.
        </p>
      </div>
      <div className="flex justify-center lg:justify-end">
        <AudioOrb
          inputAnalyser={inputAnalyser}
          outputAnalyser={outputAnalyser}
          active={status === "connected"}
        />
      </div>
    </header>
  );
};
