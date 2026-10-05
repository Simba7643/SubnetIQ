# Phase 09: Assistant integration

## Provider behavior

The assistant uses one API contract for the floating widget and the dedicated conversation page. `GET /api/ai/status` returns the selected adapter, its actual configuration state, whether authentication is required for live responses, and explicit availability for each supported provider name. `POST /api/ai/chat` accepts bounded user/assistant messages, an optional saved conversation ID, and an explicitly attached calculation.

OpenAI is the implemented live adapter. It calls the Responses endpoint with streaming enabled, a configurable model and output-token limit, and `store: false`. It consumes `response.output_text.delta`, refusal deltas, completion/usage events, incomplete responses, and provider errors. Transport redirects are rejected. Provider keys remain on the API server. This follows the [official OpenAI streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses) and [Responses API reference](https://developers.openai.com/api/reference/overview), reviewed during implementation on 4 October 2026.

The default is a deterministic demo with the visible label “AI not configured — demo response.” It teaches a small set of example concepts and can display verified values from a calculation. It does not pretend to answer arbitrary questions through a model. Guests continue to receive a clearly labeled demo even when the live provider is configured; verified sign-in is required for paid provider requests.

Anthropic and Gemini are explicit unimplemented adapters. Adding their keys does not enable them. Selecting one returns an unavailable status and the chat route provides an honestly labeled demonstration explaining that state. This preserves the agreed Phase 04 scaffolding without claiming unfinished integrations are live.

## Context and numerical reliability

The request accepts at most 30 messages, with at most 16,000 characters each and 48,000 total message characters. The last message must be a user message. Attachments must identify an actual network tool and its input; the API recomputes the result, then supplies normalized values, summary, explanation steps, warnings, and engine version. Arbitrary text cannot masquerade as a trusted numerical calculation.

For saved conversations, history is read using the verified user's RLS client rather than assuming a client-supplied conversation belongs to the caller. History is bounded before it reaches the provider. An attachment's labels remain untrusted data even though the numerical result was recomputed. The model receives instructions to preserve the engine values and their policy, explain uncertainty, and avoid inventing lookup results.

AI remains an explanatory interface. The pure network engine is responsible for exact calculation, ranges, prefixes, counts, and allocation policies. User-facing generated text should be reviewed before using it to change a network.

## Streaming and persistence

Every SSE event is a JSON object following `data:`. `meta` identifies provider, mode, optional conversation ID, and whether the request is associated with persistence. `delta` carries a content fragment. `done` signals completion. `error` carries a useful message and code, including errors that occur after HTTP status 200 has already started the stream.

The implementation bounds event buffers, accumulated output, request time, and per-user request attempts. A client disconnect aborts generation. Timed-out or interrupted partial answers are distinguished when persisted. User and assistant messages are written with the user's client; usage accounting uses the restricted service path. A database failure produces a save error rather than pretending that the response was stored.

Usage records contain actual provider token counts when a completion event supplies them. For cancelled or failed streams without a usage event, zero fields mean no usage was returned; they do not prove that the provider billed nothing. The request quota counts attempts regardless of whether the provider later reports token usage. Provider billing remains the authoritative cost record.

## Frontend integration contract

Both assistant surfaces use the same SSE route and status endpoint. The UI presents the active mode, supports Markdown and fenced code, copies text, allows cancellation/retry, and attaches a selected calculation explicitly. Saved conversations use the conversation list/message routes. Account identity changes clear private conversation state and cached account data. Markdown and JSON downloads contain user-visible conversation text and mark a response still streaming at export; provider credentials are never included.

Native text sharing is a client capability: a Radix dialog freezes and previews exactly the selected conversation text before invoking the platform share operation and provides a copy fallback. Markdown rendering preserves the React escaping boundary and the default URL sanitization; raw HTML is not enabled. Retry explicitly resubmits the question as a new visible turn and filters empty assistant placeholders, so a failed request cannot poison the next validated payload. The stream reader requires a terminal done/error event and reports premature connection endings.

## Configuration and verification

Set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` to enable the implemented adapter. The example model is configurable; deployment operators must select a model available to their provider project. Supabase configuration and the service key are required for live signed-in use. The default maximum output is 1,200 tokens and the default daily assistant quota is 30 attempts.

Automated tests pass for the provider request format, disabled response storage, delta and usage extraction, SSE byte/CRLF boundaries, interrupted streams, authentication errors without secret disclosure, unsupported-provider state, cancellation, guest demo content, context calculation, and request limits. The full API checkpoint is four suites and 56 passing tests. Eight frontend tests additionally verify stream completion/errors, truthful unsupported-provider display, valid retry payloads, review-before-share behavior, and credential-free conversation downloads. Live OpenAI generation was not executed because no user provider credentials were supplied. The completed adapter is ready for an operator-run configured smoke test; such a smoke test must be recorded as a separate result.
