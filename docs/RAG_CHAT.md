# RAG Chat — build & working notes

A narrative reference for the `/chat` feature (Track 1). Built 2026-06-02,
deployed to prod the same day. For the terse API/route reference see
`CLAUDE.md` §6/§7/§8/§15; for the decision rationale see `DECISIONS.md`
(2026-06-02 entry). This doc is the "how and why it hangs together" story.

---

## 1. What it is

A conversational interface over the existing corpus. A PM opens `/chat`, asks
a question like *"What are the top complaints in Returns this week?"*, and gets
a streamed answer that **cites the specific signals it's reasoning from** — each
`[signal <ID>]` rendered as a badge that reveals the real review text on hover.

It is scoped: the chat respects the active `?group=`, `?week=`, and `?source=`
(Sample/Live data-source toggle) from the URL,
so "this week / this group" means exactly what the rest of the dashboard shows.

## 2. The core design choice: context-stuffing, not vector RAG

"RAG" here is retrieval by **context-stuffing**, not embeddings + a vector DB.

Every turn, the backend loads:
- the **latest 3 Weekly Digests** (compact fields only), and
- up to **200 of the newest Signals**, filtered by the active group/week,

and drops them straight into the prompt alongside the question and prior turns.

**Why this and not a vector store:** the corpus is bounded (140 mock signals;
live ingestion adds ~150/run). It fits comfortably in Gemini 2.5 Flash's context
window, costs ~$0.001/turn, and needs zero new infrastructure (no embedding
job, no vector DB, no index to keep in sync). Vector RAG is the documented
upgrade path *only* once the corpus outgrows the prompt window — not before.

## 3. End-to-end data flow

```
ChatPage (browser)
  │  POST /webhook/chat  { message, history, group, week }
  ▼
server.ts  ──► validates message (400 before any stream)
  │           flushes SSE headers (text/event-stream, no buffering)
  ▼
agents/chat.ts  handleChatStream()
  │  buildChatContext(group, week):
  │     readRows("Weekly Digests") → newest 3 → compact fields
  │     readRows("Signals") → filter by group/week → newest 200 → compact
  │  buildChatPrompt(): system rules + digests + signals + history + question
  ▼
lib/gemini.ts  streamGemini()  ──► Vertex :streamGenerateContent?alt=sse
  │  yields text deltas as they arrive (async generator)
  ▼
server.ts  writes each delta as  data: {"text":"…"}    (SSE frame)
  │         ends with  event: done   (or  event: error  on failure)
  ▼
lib/api.ts  chatStream()  ──► fetch + ReadableStream reader parses SSE
  ▼
ChatPage  appends tokens to the in-flight assistant bubble (typing effect)
ChatMessage  turns [signal <ID>] into badges + tooltips
```

## 4. Backend pieces

### `src/lib/gemini.ts` — `streamGemini(prompt, opts)`
An **async generator** that calls Vertex AI's `:streamGenerateContent?alt=sse`
endpoint and `yield`s plain-text deltas as they arrive. Two things to know:
- It deliberately **does not set `responseMimeType: 'application/json'`** the way
  `callGemini` does — chat replies are prose/markdown, not JSON. (This was the
  single easiest mistake to make; `callGemini` forces JSON.)
- It reuses the existing cached `getAuthClient()` (ADC) and a new shared
  `vertexModelUrl()` helper. Returning an async generator keeps the lib free of
  any Express/HTTP knowledge — the SSE framing lives in the server.

It parses the upstream SSE stream itself: reads `res.body` via a reader, splits
on newlines, and for each `data:` line extracts
`candidates[0].content.parts[0].text`.

### `src/agents/chat.ts`
- `buildChatContext(group?, week?)` — loads digests + signals from the sheet,
  sorts newest-first (by `row_number`), scopes signals by group/week, and
  projects **compact** views. It deliberately omits the heavy Weekly Digests
  JSON columns (`Theme Breakdown JSON`, `RICE Scores JSON`, …) — stuffing those
  raw would bloat the prompt for little gain.
- `buildChatPrompt(ctx, history, message)` — assembles the system rules, the
  digest + signal context, the prior turns, and the question. The system rules
  tell the model to answer **only from the supplied data**, to cite evidence as
  `[signal <ID>]` using real `Signals.ID` values that appear in context, and to
  treat review text as data (not instructions).
- `handleChatStream(...)` — orchestrates the above and `yield*`s from
  `streamGemini`.

### `src/server.ts` — `POST /webhook/chat`
- Validated under the repo's `/webhook/*` convention (not `/chat/stream`).
- Returns a **JSON 400** if `message` is empty — this happens *before* SSE
  headers are flushed. Once the stream opens, all errors are reported as
  `event: error` SSE frames (you can't switch back to an HTTP status code).
- Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
  `Connection: keep-alive`, `X-Accel-Buffering: no` (defeats proxy buffering on
  Cloud Run), then `flushHeaders()` and streams.

## 5. Frontend pieces

### `src/lib/api.ts` — `chatStream(body, handlers)`
The shared `jsonFetch` can't be reused (it `await res.json()`s the whole body).
`EventSource` is GET-only, so for a streaming **POST** we use `fetch` +
`res.body.getReader()` + `TextDecoder`, parsing the `event:` / `data:` frames by
hand. Callbacks: `onToken`, `onError`, `onDone`; supports an `AbortSignal` for
cancellation (silent on abort).

### `src/routes/ChatPage.tsx`
- Reads `useActiveGroup()` / `useActiveWeek()` and passes them in the request,
  so chat is scoped to whatever the sidebar/topbar shows. It also fetches the
  in-scope Signals (React Query) to resolve citation tooltips locally.
- Manages the message list, the in-flight assistant message (tokens appended as
  they stream), suggestions, a Stop button (AbortController), and autoscroll.

### `src/components/chat/ChatMessage.tsx`
- Renders a bubble. For assistant messages it runs a regex pass that turns any
  signal-ID-shaped token into a clickable badge with a tooltip showing the
  signal's text + severity + source (resolved from the fetched Signals).
- **Citation matching is intentionally loose.** The model isn't perfectly
  consistent — it emits `[signal 2026-W23-80]`, `signal 2026-W23-80`, and bare
  `2026-W23-80` interchangeably. The badge regex absorbs all three forms so
  every citation becomes interactive. (Verification caught this: the strict
  bracket-only version badged only 12 of ~18 IDs; the loose version badges all.)

## 6. How to use it

**From the UI:** open `/chat?group=returns_refunds`, type a question, watch it
stream. Click a `[signal …]` badge to see the underlying review.

**From curl (backend only):**
```bash
curl -sN -X POST "$SERVICE_URL/webhook/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Top complaints this week? Cite signals.","group":"returns_refunds"}'
```
`-N` disables curl buffering so you see the `data:` frames stream in.

## 7. Operational notes & limits

- **Vertex auth:** prod runs as the Cloud Run runtime SA (`n8n-sa@…`), which has
  `roles/aiplatform.user`. Locally, the `gcp-service-account.json` identity
  (`n8n-sheets-writer@…`) is a *different* project's sheets-only SA — it needed
  a cross-project `roles/aiplatform.user` grant to call Vertex from a dev box.
- **Cloud Run:** a chat turn must finish inside the 120s request timeout (fine
  for Flash). Scale-to-zero means the first turn after idle pays a cold start
  before the first token.
- **No persistence:** history is session-only; nothing is written to the sheet.
- **Reachability:** the `/chat` UI currently only runs via local `npm run dev`
  (the frontend isn't hosted yet). The backend endpoint is live in prod.

## 8. Future work
- Vector RAG (embeddings) once the corpus outgrows the prompt window.
- Persisted chat history (a `Chat History` sheet tab) if PMs want to revisit.
- Auth in front of the API (currently publicly invokable).
- A non-streaming JSON variant is trivial to add (the generator design makes the
  fallback a one-liner) if streaming ever becomes a problem.

## 9. File index
| File | Role |
|---|---|
| `src/lib/gemini.ts` | `streamGemini()` async generator + `vertexModelUrl()` |
| `src/agents/chat.ts` | `buildChatContext` / `buildChatPrompt` / `handleChatStream` |
| `src/server.ts` | `POST /webhook/chat` (SSE framing, validation) |
| `frontend/src/lib/api.ts` | `chatStream()` SSE reader |
| `frontend/src/routes/ChatPage.tsx` | chat UI, scoping, streaming state |
| `frontend/src/components/chat/ChatMessage.tsx` | bubbles + citation badges |
| `frontend/src/App.tsx`, `components/layout/TopBar.tsx`, `lib/url-state.ts` | route + page-tab + title |
