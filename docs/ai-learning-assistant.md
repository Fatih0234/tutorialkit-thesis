# Learner AI Learning Assistant

The Phase 1.5 assistant is a learner-only utility surface for the immersive interactive lesson. It provides concise explanations, hints, attempt review, debugging help, and summaries of nearby teacher changes. It is deliberately not a teacher resource: opening or using it does not change `TeacherRecording`, presentation layouts, `frontmostBySide`, or timeline events.

## Boundaries

React owns the window and conversation controller; provider calls live only in the Astro/Vite middleware under `/api/interactive/ai`. The runtime package contains provider-independent intent, context, action, and conversation contracts. Teacher state is loaded from the file-backed published-recording store and materialized at the requested timestamp on the server. Browser workspace context is bounded and sensitive paths/credential-like text are filtered before the provider call.

The assistant is shown only in learner playback and experiment mode. A learner may highlight code in the existing editor and explicitly choose **Ask AI about selection**. Highlighting alone sends nothing. The pending attachment shows its normalized file path and one-based line range, can be removed before sending, applies to one successful request, and is then cleared. It never writes files, runs commands, changes playback automatically, or receives webcam/microphone data. Suggested file opens, highlights, seeks, and read-only diffs are actions that require an explicit learner click. The assistant is kept outside presentation resources and the recording schema so resource layering remains teacher truth.

## API and configuration

The server exposes `GET /api/interactive/ai/status` and `POST /api/interactive/ai/chat`. Requests use the authenticated development session and require the learner role. Responses use the Vercel AI SDK UI message stream; no provider conversation storage is used.

```text
INTERACTIVE_AI_ENABLED=true
OPENAI_API_KEY=...                 # server environment only; never commit this
INTERACTIVE_AI_MODEL=gpt-5.6-luna
INTERACTIVE_AI_REASONING_EFFORT=low
INTERACTIVE_AI_MAX_OUTPUT_TOKENS=1200
INTERACTIVE_AI_USER_HASH_SALT=...
INTERACTIVE_AI_TEST_MODE=true      # deterministic local tests only
```

The default model is `gpt-5.6-luna`; there is no silent model fallback. Test mode is an explicit fake streamed response and must not be enabled in production.

## Privacy and safety

The request excludes sensitive paths (`.env`, private keys, and similar files), redacts likely keys/tokens, limits selected text to 12 KiB, verifies its file and line range against the submitted learner workspace, and limits source and terminal context, and treats lesson/source/terminal text as untrusted data. Cookies, session records, media, environment variables, and raw webcam/microphone content are not sent. OpenAI requests set `store: false` and use an HMAC-derived safety identifier. The demo currently uses file-backed persistence, development identity, and an in-memory rate limiter boundary; these are thesis infrastructure, not production services.

Conversations use a separate client storage boundary and must not be mixed with learner deltas or timeline checkpoints. Full selected source text is request context only and is not stored as conversation metadata; selection changes and attachments are also absent from teacher events, learner deltas, checkpoints, and presentation state. The current integration includes an in-memory adapter for tests; durable browser history should use a separate `interactive-ai` IndexedDB database before production rollout.

## Deliberate non-goals

There are no autonomous agents, code-writing or workspace-mutation tools, RAG/vector search, web search, MCP, voice, cross-lesson memory, or terminal command execution. Production follow-up requires distributed rate limiting, production authentication/database, retention and institutional privacy policies, under-18 safeguards, abuse monitoring, formal evaluation, accessibility testing, and cost monitoring.
