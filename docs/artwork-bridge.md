# Artwork bridge feature specification

Status: proposal, October 26, 2026. Operation names, message fields, and examples
are design sketches, not an implemented API or a frozen protocol. This module
is part of the [feature plan](feature-plan.md) and enters the first functional
milestone in the [roadmap](roadmap.md).

## Purpose

Give a running artwork an explicit, discoverable interface to its host viewer.
An artwork can accept interactions, report its current content, and announce
changes while retaining control over its artistic behavior and internal state.

bitVerse is the first intended host integration. Examples include asking a
generative poem for its visible text, advancing a stanza, activating a named
region, or updating an exhibition caption when an artwork changes.

The bridge should work above p5.js, Canvas 2D, and Three.js/WebGL. Neither a host
nor an agent should need to inspect renderer internals, scrape a canvas, or
execute arbitrary JavaScript inside the artwork.

## Participants and connection

- The artwork registers capabilities and handles permitted operations.
- The host viewer connects to one running artwork instance and presents or
  invokes its available interactions.
- An optional agent or automation acts through the host's authorized session.
  The artwork does not need to contain an MCP server or agent SDK.

Use browser window messaging for an iframe connection, optionally transferring
a dedicated message port after a validated handshake. A transport abstraction
can support same-page hosting later without changing the operation vocabulary.
[Browser messaging supports cross-origin iframe communication](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage);
dedicated ports are provided by the
[Channel Messaging API](https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API).

Choose the message envelope separately from its transport.
[JSON-RPC conventions](https://www.jsonrpc.org/specification) are a candidate
for request/response messages carried over `postMessage` or a
message port; JSON-RPC and browser messaging are not competing transports.
If adopted, document how discovery, subscriptions, capabilities, completion,
and sessions extend those conventions. No envelope format is selected yet.

The lifecycle is disconnected, connecting, capability negotiation, connected,
and closed. An iframe load is not equivalent to artwork readiness. Protocol
connection, content readiness, and preview-capture readiness are separate signals.
Navigation or reload creates a new session and invalidates old requests and
subscriptions.

## Communication model

| Kind | Direction | Semantics | Example |
| --- | --- | --- | --- |
| Discovery | Host and artwork | Describe identity and available capabilities | List commands, query shapes, and supported versions |
| Command | Host to artwork | Request an explicit action that may change state | Advance a stanza or activate a region |
| Query | Host to artwork, with response | Observe declared state without changing it | Read the visible poem |
| Event | Artwork to subscribed host | Announce a change or lifecycle transition | Poem changed or rendering completed |

For the initial protocol, commands and queries are host-initiated. Artwork
requests for host services, such as a download dialog, are a later negotiated
capability; emitting an event does not authorize a host-side action.

### Host API and wire protocol

Expose asynchronous discovery and queries at the host boundary, since an iframe
may need time to connect and answer. Commands return a typed result or operation
handle with acceptance, completion, and failure semantics; a fire-and-forget
`void` dispatch cannot provide reliable export or transition control.

Define per-operation argument, response, and event schemas instead of public
`any` payloads. Broad tags such as playback or transcript are discovery aids,
not substitutes for operation-level types, availability, and permissions. Use
an explicit experimental protocol version through the pilot rather than implying
a stable 1.0 contract.

The convenient host API is separate from the wire format. Subscription callbacks
stay in the host; serialize subscription requests, IDs, event data, and errors,
not handler functions. Host implementations for browser embeds, test harnesses,
or native shells must each supply an appropriate transport and connection policy.

## Discovery and capability descriptions

An artwork should advertise its artwork ID, running-instance ID, recipe/code
version where available, supported protocol versions, and capabilities. Host
permission and current availability are distinct from an advertised capability.

Each operation describes:

- A stable name and human-readable title and explanation.
- Input/output schemas, units, bounds, and optional defaults.
- Whether it observes or changes state, and which state category it affects.
- Availability conditions and any required host-granted scope.
- Whether it is replayable, idempotent, cancellable, or long-running.
- Events associated with completion or resulting state changes.

Interactive targets additionally describe a stable ID, accessible label,
supported action, and surface. Bounds or geometry are optional and may change
with layout. Discovery must not promise that a command remains available after
the artwork changes; invocation checks availability again.

Use a small standard namespace for lifecycle, playback, interaction, and state,
plus documented extension namespaces such as poetry. Discover extensions
instead of assuming every artwork implements them. Unsupported operations
return an explicit error.

Descriptions let a host create controls and let an agent understand permitted
operations. Descriptions and returned content remain artwork-supplied data,
not instructions that override host policy.

## Commands and interaction targets

### Three levels of interaction

| Level | Illustrative request | Intended use |
| --- | --- | --- |
| Coordinates | Activate surface main at x 0.35, y 0.62 | Spatial interaction where a named target is unavailable |
| Named target | Activate target moon | Stable interaction across layout changes |
| Artistic action | Invoke poetry.nextStanza | Express intent without a simulated pointer |

For example, proposed host-side calls could be:

```js
await artwork.command("interaction.activate", {
  surface: "main",
  x: 0.35,
  y: 0.62,
  coordinateSpace: "normalized"
});

await artwork.command("interaction.activate", { target: "moon" });
await artwork.command("poetry.nextStanza");
```

Define normalized coordinates as left-to-right x and top-to-bottom y in the
range zero to one across the registered logical artwork surface. They are not
coordinates of the containing iframe, host toolbar, or letterboxed viewport.
Renderer integrations handle transforms and Three.js picking. Reject unknown
surfaces, out-of-range coordinates, and unavailable targets explicitly.

Use the [coordinate and scaling contract](feature-plan.md#coordinate-and-scaling-contract)
to map between surface, composition, and display spaces. Validate named targets
and coordinate activation across viewer sizes and device pixel densities;
changing export resolution must not change the meaning of a bridge coordinate.

Physical input, keyboard actions, and programmatic activation should call the
same artist-defined handler. A command is an application interaction, not a
trusted physical browser click. It does not bypass browser restrictions on
fullscreen, audio, downloads, or other user-activation-dependent actions.

Initial standard commands should cover activation and declared playback
controls. Parameter changes, seed regeneration, reset, and restoration require
explicit capabilities and mode policies. A token viewer must not expose studio
seed regeneration simply because the underlying sketch supports it.

### Completion and ordering

A command response distinguishes acceptance from completion. An animation
transition may be accepted immediately and complete later through an operation
ID and completion event. Define ordering for mutating commands so concurrent
requests cannot silently scramble state. Use expected revisions when a command
depends on previously observed state; return a conflict if that state changed.

A request ID supports duplicate detection within a live session. Retrying
nextStanza with the same ID must not advance twice. This is not a guarantee of
exactly-once execution across crashes or reconnects: a timeout can mean the
outcome is unknown, so query state before deciding to issue a new mutation.

## Queries and semantic content

Queries are read-only. Reading a poem must not draw a new random value, advance
the animation, or modify the recipe. Return a revision and capture time or frame
when useful so the host knows which moment the response describes.

The guarantee is observational, side-effect-free behavior, not repeated equal
answers from a changing artwork. Two queries may legitimately return different
stanzas because independent animation advanced between them. A query must not
cause that advancement. Include the relevant revision/position with a result;
test nonmutation under controlled time separately from live-state freshness.

Example response to the proposed `poetry.current` query:

```json
{
  "revision": 42,
  "language": "en",
  "title": "After the rain",
  "lines": [
    { "id": "line-1", "text": "The window keeps" },
    { "id": "line-2", "text": "a little of the weather" }
  ],
  "visibleLineIds": ["line-1", "line-2"],
  "phase": "complete"
}
```

The schema should distinguish the complete generated poem, visible lines,
reading order, language, and transition phase. Similar extensions can describe
selected objects, palette information, composition structure, or audio state.
Expose only artist-selected content, not a dump of internal variables.

Host uses include transcripts, read-aloud interfaces, copying or saving text,
captions, discussion by an assistant, and image/text capture. The artist may
choose to expose only visible content and withhold future text.

For consistent image/text capture, a later snapshot capability must bind image
and semantic state to the same revision or frame. Two unrelated queries during
animation do not establish an atomic snapshot.

## Events and subscriptions

| Proposed event | Host use |
| --- | --- |
| artwork.ready | Remove loading UI and enable supported actions |
| render.completed | Consider the identified output for capture |
| poetry.changed | Update a transcript or caption |
| selection.changed | Display information about the selected target |
| palette.changed | Update explicitly configured exhibition styling |
| playback.changed | Synchronize pause/resume controls |
| artwork.error | Display an actionable failure state |

Events identify their session, sequence, and relevant state revision. State may
change from native user input or the artwork's own progression as well as from
host commands; all should follow the same notification semantics.

Support subscription IDs, unsubscribe, teardown on disconnect, and configurable
throttling or batching. Do not stream every animation frame by default. Describe
whether intermediate updates can be coalesced. Detect event gaps and allow a
fresh state query rather than assuming durable event delivery.

## State and reproducibility

The [shared artwork model](feature-plan.md#shared-artwork-model) separates
canonical identity, interactive session state, and host presentation state.
Bridge commands follow those boundaries. A new camera angle or stanza selection
does not automatically change a token's canonical traits.

Optional snapshots include a recipe reference, schema version, state revision,
and artist-defined session state. Restore only validated compatible snapshots.
An interaction log may record ordering, arguments, simulation time, external
inputs, and the starting recipe. Logs alone are insufficient for replay when
unrecorded time, network data, or randomness affects the result.

Snapshot/restore and deterministic replay are advanced capabilities, not
requirements for basic discovery and read-only queries. Pause is also not
assumed to freeze every source of state unless the artwork declares that behavior.

Expose the supported [temporal reconstruction modes](feature-plan.md#temporal-reconstruction)
through discovery. Where seeking exists, declare time units, step semantics,
whether replay is required, and available progress/cancellation behavior.
Do not imply that a frame number alone is enough to reconstruct a simulation.

## Message contract and connection policy

The wire format remains a design decision. It should represent protocol version,
session ID, message kind, request or subscription ID, operation name, payload,
and state revision where applicable. Responses need structured results and
errors such as unsupported operation, invalid input, unavailable state,
permission denied, revision conflict, timeout, and render failure.

Connection requirements:

- Validate source window, expected origin where available, message shape,
  supported version, and session before dispatching operations.
- Use an explicit target origin for ordinary origin-bearing frames. Opaque
  sandbox/data origins need a separately designed bootstrap policy tied to the
  expected frame and transferred port; accepting the string null as identity
  is insufficient. Unsupported configurations should fail clearly.
- Treat a negotiated capability as scoped to this connection, not as proof of
  wallet ownership or authority over a token.
- Limit message sizes, outstanding requests, event rates, and expensive actions.
  Use separately negotiated binary transfers if large image export is added.
- Expose registered handlers only. No arbitrary evaluation, DOM selectors,
  private-state inspection, or implied permission to mint or publish.
- Close stale ports, reject old-session messages, and remove listeners on
  teardown. Handle multiple artwork instances without cross-routing.

Exact origin/source checks and their limitations should follow the
[browser messaging contract](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).

## bitVerse integration

Implement an artwork endpoint in the SDK and a host client in bitVerse. Existing
live embedding does not by itself provide this bridge. The exposed bitVerse
tools describe live views and dynamic exhibition expressions, but no general
artwork command/query protocol was established during planning.

The host should discover capabilities, display supported controls, manage
subscriptions, and route commands to the selected running instance. An optional
agent path is agent to bitVerse session to bridge to artist handler. A token ID
alone cannot identify which live poem is currently visible; session and instance
identity are required.

Later exhibition bindings can map declared events or query values to captions,
transcripts, frame colors, or other host fields. Bindings must be explicit and
define fallback values, update rates, and behavior after disconnect. Do not
introduce uncontrolled feedback loops between host bindings and artwork state.

Unmodified artworks remain viewable through the existing viewer but do not gain
programmable control. A host timeout should offer ordinary viewing, not attempt
to infer a hidden interface.

## Initial scope and acceptance criteria

The first bridge milestone includes discovery, one validated connection,
registered commands, read-only queries, events, session cleanup, and a minimal
test host. Include core playback/activation examples and a generative-poetry
extension. Production bitVerse viewer integration follows in the next milestone.

Publish experimental schemas early and revise them using static, animated, and
interactive artwork trials. Keep protocol versions explicit during the pilot;
stabilize the core only after the artwork endpoint and a separate host client
agree on schemas, behavior, and failure cases. Domain extensions may remain
experimental after the core stabilizes. The first host/poetry trial must run
without a full workbench.

The poetry reference should demonstrate that:

1. The host discovers the available operations and their schemas.
2. Under controlled time, a query returns the visible poem without changing
   its revision or random state. During playback, each response identifies the
   state it observed without claiming all repeated queries must be identical.
3. A physical activation and a bridge command invoke the same artistic behavior.
4. Advancing the poem produces an ordered event and an identifiable completion.
5. Repeated request IDs do not cause a second advance within the session.
6. Invalid arguments and unsupported operations produce structured errors.
7. Multiple instances, reload, disconnect, and stale messages remain isolated.
8. The artwork still runs standalone without a connected host.
9. Asynchronous discovery and commands distinguish acceptance, completion, and
   errors. Unsupported temporal operations are discoverable and rejected clearly.

Snapshot/restore, atomic image/text capture, agent-session routing, dynamic
exhibition bindings, gesture streams, and multi-artwork orchestration follow
after this contract works with real art. They should not delay the basic bridge.
