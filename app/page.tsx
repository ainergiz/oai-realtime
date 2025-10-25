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

type SessionStatus = "idle" | "connecting" | "connected" | "error";

type ClientSecretPayload = {
  client_secret: string;
  expires_at?: number;
  client_secret_id?: string;
};

type MessageItem = Extract<RealtimeItem, { type: "message" }>;

const ASSISTANT_INSTRUCTIONS =
  "You are a friendly realtime assistant that keeps responses short, helpful, and easy to understand, even when speaking aloud.";

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
  }, [cleanupAudio]);

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
        name: "my-first-voice-agent",
        instructions: ASSISTANT_INSTRUCTIONS,
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
        model: "gpt-realtime",
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
        model: "gpt-realtime",
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
  }, [resetSession, status]);

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
                gpt-realtime
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
