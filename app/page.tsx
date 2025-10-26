"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  type RealtimeItem,
  RealtimeSession,
} from "@openai/agents/realtime";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AudioOrb } from "../components/audio-orb";
import {
  createRecruiterTools,
  type EligibilitySummary,
  type GuardrailStateUpdate,
  type ModerationRecord,
} from "../lib/recruiter-tools";

const REALTIME_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";

type SessionStatus = "idle" | "connecting" | "connected" | "error";

type ClientSecretPayload = {
  client_secret: string;
  expires_at?: number;
  client_secret_id?: string;
};

type MessageItem = Extract<RealtimeItem, { type: "message" }>;

const ASSISTANT_INSTRUCTIONS = `
You are Delfa, a clinical trial recruiter for the exploratory study
"Mind Body Intervention for Chronic Migraine Headaches." Your job is to warmly
screen potential participants and determine eligibility.

Follow this structure:
1. Greet the participant, explain you are gathering information for the migraine mind-body study, and ask for consent to proceed.
2. Check every inclusion criterion, asking one focused question at a time:
   • Age 18 or older.
   • Prior migraine diagnosis that matches ICHD-3 beta standards (or a neurologist-confirmed diagnosis).
   • Headache Impact Test-6 (HIT-6) score of 50 or higher. If unknown, ask about daily impact and note as "unknown".
   • Migraine frequency of at least 5 days per month.
   • Willingness to participate in the mind-body program and remote sessions.
3. Review exclusion criteria and record anything reported:
   • Headaches due to an organic cause (cancer, sinus infection, head trauma, cerebrovascular disease).
   • Other chronic pain syndromes that would confound evaluation (fibromyalgia, chronic idiopathic neck pain, etc.).
   • Cognitive impairment or dementia.
   • Active addiction disorder (e.g., cocaine or IV heroin use) that interferes with participation.
   • Major psychiatric comorbidities such as schizophrenia (mild anxiety or depression are acceptable).
4. Reflect back important details so the participant feels heard, give space for clarifying questions, and keep responses concise and empathetic.
5. Before speaking each turn, call the \`guardrail_state\` tool with your current state, intended action, any PII you plan to request, and potential violations so the supervising app can enforce safety.
6. If the user input or your planned response seems sensitive (mentions emergencies, self-harm, threats, discrimination, or graphic content), call the \`moderation_check\` tool before replying so the supervisor can review it.
7. When you are confident in the outcome—or the participant requests it—speak the decision, explain the reasoning, and then call the \`record_eligibility\` tool with the eligibility status ("eligible", "ineligible", or "review") and a short list of reasons.

Additional guidance:
- Do not fabricate answers; if information is incomplete, let the participant know you need more clarity.
- Avoid medical jargon unless the participant introduces it first.
- When in doubt about content safety or tone, run \`moderation_check\` before replying so a human can review if needed.
- If the guardrail flags an emergency, crisis, lack of consent, or minor participant, immediately escalate using the provided crisis script and stop the screening flow.
- Reassure participants about confidentiality.
- If someone does not qualify, gently suggest they speak with their clinician for alternatives.
- Always end by asking if they have questions or need anything else.
`;

const isMessageItem = (item: RealtimeItem): item is MessageItem =>
  item.type === "message";

const getMessageCopy = (item: MessageItem) => {
  const transcript = item.content
    .map((content) => {
      switch (content.type) {
        case "input_text":
        case "output_text":
          return content.text;
        case "input_audio":
        case "output_audio":
          return content.transcript ?? "";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!transcript) {
    return `(${item.role} event)`;
  }

  return transcript;
};

export default function Home() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [input, setInput] = useState("");
  const [eligibilitySummary, setEligibilitySummary] =
    useState<EligibilitySummary | null>(null);
  const [guardrailState, setGuardrailState] =
    useState<GuardrailStateUpdate | null>(null);
  const [moderationLog, setModerationLog] = useState<ModerationRecord[]>([]);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const listenerCleanupRef = useRef<Array<() => void>>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const [analysers, setAnalysers] = useState<{
    input: AnalyserNode | null;
    output: AnalyserNode | null;
  }>({ input: null, output: null });

  const messageHistory = useMemo(
    () => history.filter(isMessageItem),
    [history],
  );
  const latestModeration = useMemo(
    () => (moderationLog.length ? moderationLog[moderationLog.length - 1] : null),
    [moderationLog],
  );


  const cleanupAudio = useCallback(() => {
    inputSourceRef.current?.disconnect();
    inputSourceRef.current = null;
    outputSourceRef.current?.disconnect();
    outputSourceRef.current = null;
    inputAnalyserRef.current?.disconnect();
    inputAnalyserRef.current = null;
    outputAnalyserRef.current?.disconnect();
    outputAnalyserRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    mediaStreamRef.current = null;
    const audioElement = audioElementRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.load();
      audioElement.muted = true;
    }
    setAnalysers({ input: null, output: null });
  }, []);

  const resetSession = useCallback(() => {
    listenerCleanupRef.current.forEach((cleanup) => {
      cleanup();
    });
    listenerCleanupRef.current = [];

    cleanupAudio();

    const session = sessionRef.current;
    if (session) {
      session.close();
    }
    sessionRef.current = null;
    setHistory([]);
    setEligibilitySummary(null);
    setGuardrailState(null);
    setModerationLog([]);
  }, [cleanupAudio]);

  const handleGuardrailViolation = useCallback(
    (payload: GuardrailStateUpdate) => {
      const violationSummary = payload.violations?.length
        ? payload.violations.join(", ")
        : "guardrail triggered";
      const message =
        payload.risk_notes?.trim() ??
        `Guardrail triggered: ${violationSummary}`;

      resetSession();
      setGuardrailState(payload);
      setStatus("error");
      setError(message);
    },
    [resetSession],
  );

  const recruiterTools = useMemo(
    () =>
      createRecruiterTools({
        setEligibilitySummary: (summary) => setEligibilitySummary(summary),
        onGuardrailUpdate: (payload) => setGuardrailState(payload),
        onGuardrailViolation: handleGuardrailViolation,
        onModerationResult: (record) =>
          setModerationLog((previous) => {
            const next = [...previous, record];
            return next.slice(-10);
          }),
      }),
    [handleGuardrailViolation],
  );

  const connect = useCallback(async () => {
    if (status === "connecting") return;

    setStatus("connecting");
    setError(null);
    resetSession();

    try {
      const response = await fetch("/api/realtime-session", {
        method: "POST",
      });

      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(
          details?.error ?? "Failed to retrieve realtime client secret.",
        );
      }

      const payload = (await response.json()) as ClientSecretPayload;
      if (!payload.client_secret) {
        throw new Error("Realtime client secret not present in server reply.");
      }

      const audioContext = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      mediaStreamRef.current = mediaStream;

      const inputSource = audioContext.createMediaStreamSource(mediaStream);
      const inputAnalyser = audioContext.createAnalyser();
      inputAnalyser.fftSize = 512;
      inputAnalyser.smoothingTimeConstant = 0.86;
      inputSource.connect(inputAnalyser);
      inputSourceRef.current = inputSource;
      inputAnalyserRef.current = inputAnalyser;
      setAnalysers({ input: inputAnalyser, output: null });

      const agent = new RealtimeAgent({
        name: "clinical-trial-intake-agent",
        instructions: ASSISTANT_INSTRUCTIONS,
        tools: recruiterTools,
      });

      const audioElement =
        audioElementRef.current ?? document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.muted = true;
      audioElementRef.current = audioElement;

      const transport = new OpenAIRealtimeWebRTC({
        audioElement,
        mediaStream,
      });

      const session = new RealtimeSession(agent, {
        model: REALTIME_MODEL,
        transport,
      });

      const ensureOutputAnalyser = () => {
        if (!audioContextRef.current || !audioElementRef.current) {
          return false;
        }
        if (outputAnalyserRef.current) {
          return true;
        }

        const element = audioElementRef.current;
        let stream: MediaStream | null = null;

        type CapturableAudioElement = HTMLAudioElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };

        const capturable = element as CapturableAudioElement;

        if (typeof capturable.captureStream === "function") {
          stream = capturable.captureStream();
        } else if (typeof capturable.mozCaptureStream === "function") {
          stream = capturable.mozCaptureStream();
        }

        if (!stream && element.srcObject instanceof MediaStream) {
          stream = element.srcObject;
        }

        if (!stream) {
          return false;
        }

        if (typeof stream.getAudioTracks === "function") {
          const hasAudioTrack = stream.getAudioTracks().length > 0;
          if (!hasAudioTrack) {
            return false;
          }
        }

        try {
          const outputSource =
            audioContextRef.current.createMediaStreamSource(stream);
          const outputAnalyser = audioContextRef.current.createAnalyser();
          outputAnalyser.fftSize = 512;
          outputAnalyser.smoothingTimeConstant = 0.78;
          outputSource.connect(outputAnalyser);
          outputAnalyser.connect(audioContextRef.current.destination);
          outputSourceRef.current = outputSource;
          outputAnalyserRef.current = outputAnalyser;
          setAnalysers({ input: inputAnalyser, output: outputAnalyser });
          return true;
        } catch (outputError) {
          console.error("Unable to initialise output analyser", outputError);
          return false;
        }
      };

      if (!ensureOutputAnalyser()) {
        const onPlaying = () => {
          ensureOutputAnalyser();
        };
        audioElement.addEventListener("playing", onPlaying);
        listenerCleanupRef.current.push(() =>
          audioElement.removeEventListener("playing", onPlaying),
        );
      }

      const handleHistoryUpdated = (items: RealtimeItem[]) => {
        setHistory(items);
      };
      session.on("history_updated", handleHistoryUpdated);
      listenerCleanupRef.current.push(() =>
        session.off("history_updated", handleHistoryUpdated),
      );

      const handleError = (event: { error: unknown }) => {
        setStatus("error");
        const message =
          event?.error instanceof Error
            ? event.error.message
            : typeof event?.error === "string"
              ? event.error
              : "Unexpected realtime error.";
        setError(message);
      };
      session.on("error", handleError);
      listenerCleanupRef.current.push(() => session.off("error", handleError));

      const handleAudioStart = () => {
        ensureOutputAnalyser();
        setStatus("connected");
      };
      session.on("audio_start", handleAudioStart);
      listenerCleanupRef.current.push(() =>
        session.off("audio_start", handleAudioStart),
      );

      await session.connect({
        apiKey: payload.client_secret,
        model: REALTIME_MODEL,
      });

      ensureOutputAnalyser();
      sessionRef.current = session;
      setStatus("connected");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to start realtime session.";
      setError(message);
      setStatus("error");
      resetSession();
    }
  }, [REALTIME_MODEL, recruiterTools, resetSession, status]);

  const disconnect = useCallback(() => {
    resetSession();
    setStatus("idle");
    setError(null);
  }, [resetSession]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const session = sessionRef.current;
      const trimmed = input.trim();
      if (!session || !trimmed) {
        return;
      }

      session.sendMessage({
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: trimmed,
          },
        ],
      });
      setInput("");
    },
    [input],
  );

  useEffect(
    () => () => {
      resetSession();
    },
    [resetSession],
  );

  return (
    <div className="flex min-h-screen justify-center bg-zinc-950/95 px-4 py-12 text-white">
      <main className="flex w-full max-w-4xl flex-col gap-8 rounded-3xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-sm">
        <header className="flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col gap-3">
            <span className="text-sm uppercase tracking-[0.3em] text-emerald-300/80">
              OpenAI Realtime Quickstart
            </span>
            <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Talk to your realtime assistant
            </h1>
            <p className="text-base text-zinc-300 sm:text-lg">
              Click connect to create a short-lived client secret, share your
              mic, and start a conversation with the{" "}
              <span className="font-semibold text-emerald-300">
                {REALTIME_MODEL}
              </span>{" "}
              model.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <AudioOrb
              inputAnalyser={analysers.input}
              outputAnalyser={analysers.output}
              active={status === "connected"}
            />
          </div>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-zinc-950/40 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={connect}
              disabled={status === "connecting" || status === "connected"}
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-5 py-2 text-sm font-medium uppercase tracking-wide text-zinc-950 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/50"
            >
              {status === "connecting" ? "Connecting..." : "Connect"}
            </button>
            <button
              type="button"
              onClick={disconnect}
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
            WebRTC. The orb reflects live energy from you and the assistant—use
            the text box if you prefer to chat silently.
          </p>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-zinc-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Conversation</h2>
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-4">
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
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/40 p-4 sm:flex-row"
          >
            <div className="flex-1">
              <label htmlFor="text-input" className="sr-only">
                Send a text message
              </label>
              <input
                id="text-input"
                name="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type a quick question..."
                className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
                disabled={status !== "connected"}
              />
            </div>
            <button
              type="submit"
              disabled={status !== "connected" || input.trim() === ""}
              className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
            >
              Send
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
