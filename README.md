## Delfa Realtime Recruiter

This is a Next.js application that hosts an OpenAI Realtime agent for clinical-trial recruitment. This is my draft implementation of what a very primordial recruitment agent would look like. It streams audio both directions, runs guardrail tooling on every assistant turn, and looks up structured study data when the user requests trial details.

### Requirements

- Node.js 20+
- pnpm as a package manager
- An OpenAI key with Realtime access; optionally set `NEXT_PUBLIC_OPENAI_REALTIME_MODEL` to override the default `gpt-realtime-mini`. Options are gpt-realtime (more expensive/better one) and gpt-realtime-mini(cheaper one)

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

Example clinical trial info I've selected for this implementation lives in `lib/study-info.ts`. The `lookup_info` tool consumes that file to answer study questions. You can update the file with a different trial alongside lib/prompt.ts.

### Project layout

- `app/page.tsx` – session bootstrap, audio plumbing, and layout
- `components/` – presentation components (audio orb, conversation log, status UI)
- `lib/recruiter-tools.ts` – guardrail, moderation, and study lookup tools
- `lib/study-info.ts` – structured study snapshot consumed by `lookup_info`
