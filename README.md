## Delfa Realtime Recruiter

This is my attempt to create a primordial realtime multimodal (text and voice) clinical recruitment agent. It's a Next.js application that hosts an OpenAI Realtime agent. It streams audio both directions, runs guardrail tooling on every assistant turn, and looks up structured study data when the user requests trial details.

### Realtime architecture

- **Ephemeral session secrets.** Clicking Start posts to `/api/realtime-session/route.ts`, which exchanges the server-side `OPENAI_API_KEY` for a short-lived client secret from `https://api.openai.com/v1/realtime/client_secrets`. The browser never sees the long-lived key.
- **WebRTC transport.** The UI instantiates `OpenAIRealtimeWebRTC`, which pairs the ephemeral secret with the user’s microphone stream and plays back model audio. Input/output analysers keep the audio orb reactive to live levels.
- **Tool execution loop.** `RealtimeSession` registers guardrail, moderation, and `lookup_info` tools via `createRecruiterTools`. When the model requests a tool call, the client executes it and posts the result back over the realtime data channel.
- **Study lookup.** Tool responses pull from `lib/study-info.ts`, which stores trial metadata in a structured form so the agent can cite accurate facts.

more info about this can be found here: https://platform.openai.com/docs/guides/realtime-conversations

### Requirements

- Node.js 20+
- pnpm as a package manager
- An OpenAI key with Realtime access; optionally set `NEXT_PUBLIC_OPENAI_REALTIME_MODEL` to override the default `gpt-realtime-mini`

### Install

```bash
pnpm install
```

### Run locally

```bash
pnpm run dev
```

Open <http://localhost:3000> and allow microphone access when prompted.

### Study metadata

Clinical trial info lives in `lib/study-info.ts`. The `lookup_info` tool consumes that file to answer study questions. Update it whenever protocol details change; no additional build step is needed.

### Quality checks

```bash
pnpm run lint    # biome static analysis
pnpm run format  # biome write mode
```

### OpenAI environment

Set `OPENAI_API_KEY` on the server side so `/api/realtime-session` can negotiate client secrets. Optionally set `NEXT_PUBLIC_OPENAI_REALTIME_MODEL` if you want to swap between `gpt-realtime-mini` and `gpt-realtime`.

### Project layout

- `app/page.tsx` – session bootstrap, audio plumbing, and layout
- `components/` – presentation components (audio orb, conversation log, status UI)
- `lib/recruiter-tools.ts` – guardrail, moderation, and study lookup tools
- `lib/study-info.ts` – structured study snapshot consumed by `lookup_info`
