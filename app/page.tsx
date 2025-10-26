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
import { SessionHero } from "../components/session-hero";
import { SessionControls } from "../components/session-controls";
import { ConversationPanel } from "../components/conversation-panel";
import {
  createRecruiterTools,
  type EligibilitySummary,
  type GuardrailStateUpdate,
  type ModerationRecord,
} from "../lib/recruiter-tools";
import { ASSISTANT_INSTRUCTIONS } from "../lib/prompts";
import { getMessageCopy } from "../lib/messages";
import { type MessageItem, type SessionStatus } from "../lib/session-types";

const REALTIME_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";

type ClientSecretPayload = {
  client_secret: string;
  expires_at?: number;
  client_secret_id?: string;
};

const isMessageItem = (item: RealtimeItem): item is MessageItem =>
  item.type === "message";

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
        <SessionHero
          status={status}
          modelName={REALTIME_MODEL}
          inputAnalyser={analysers.input}
          outputAnalyser={analysers.output}
        />

        <SessionControls
          status={status}
          error={error}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        <ConversationPanel
          messageHistory={messageHistory}
          guardrailState={guardrailState}
          latestModeration={latestModeration}
          eligibilitySummary={eligibilitySummary}
          status={status}
          inputValue={input}
          onInputChange={(value) => setInput(value)}
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  );
}
