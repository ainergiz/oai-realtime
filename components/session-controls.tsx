import type { SessionStatus } from "../lib/session-types";

type SessionControlsProps = {
  status: SessionStatus;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
};

export const SessionControls = ({
  status,
  error,
  onConnect,
  onDisconnect,
}: SessionControlsProps) => {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-zinc-950/40 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConnect}
          disabled={status === "connecting" || status === "connected"}
          className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-5 py-2 text-sm font-medium uppercase tracking-wide text-zinc-950 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/50"
        >
          {status === "connecting" ? "Connecting..." : "Connect"}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={status === "idle" || status === "error"}
          className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2 text-sm font-medium uppercase tracking-wide text-zinc-200 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disconnect
        </button>
        <span className="ml-auto text-sm text-zinc-400">
          Status:{" "}
          <span
            className={
              status === "connected"
                ? "font-medium text-emerald-300"
                : status === "connecting"
                  ? "font-medium text-yellow-300"
                  : status === "error"
                    ? "font-medium text-rose-300"
                    : "font-medium text-zinc-200"
            }
          >
            {status}
          </span>
        </span>
      </div>
      {error ? (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-zinc-500">
        Tip: once connected, we automatically capture microphone input via
        WebRTC. The orb reflects live energy from you and the assistant—use the
        text box if you prefer to chat silently.
      </p>
    </section>
  );
};
