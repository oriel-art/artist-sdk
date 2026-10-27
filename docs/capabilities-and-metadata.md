# Capabilities, metadata, and discovery

This local feature introduces `@oriel-art/capabilities` and
`@oriel-art/metadata`, plus the SDK's `@oriel-art/artist-sdk/discovery`
entry point. All three also work as native browser modules from `src/`.
The two standalone packages contain bundled ESM and TypeScript declarations,
with no runtime dependencies or required DOM, renderer, wallet, or network.
They are not published by this change.

## Run and integrate

```sh
npm ci
node examples/discovery/main.mjs
node examples/discovery/modes-and-print.mjs
npm test
npm run test:types
npm run test:packages
npm run test:browser
npm run size
```

`npm ci` builds both workspace packages. After source edits, run `npm run build`
before importing workspace packages. The canonical implementation is under
`src/`; `scripts/build-packages.mjs` bundles the shared data validation into each
package. Generated `packages/*/dist` directories are ignored by Git.
`npm run test:packages` packs all three packages, installs their tarballs offline
in a temporary project, and checks runtime imports and TypeScript resolution.

The [complete JSON example](../examples/discovery/artwork.json) describes a
square print with project, edition, translations, and reference metadata.
The [runnable example](../examples/discovery/main.mjs) shows static validation,
explicit runtime evaluation, and integration with an existing artwork.
The [mode and saved-print example](../examples/discovery/modes-and-print.mjs)
demonstrates current-mode discovery, a read-only bridge, state replay, and
screening tied to one saved composition and frame. All its print limits and
inspection outcomes are synthetic fixtures, not approved Kepler's Dream print
specifications or real measurements of grain, line weight, or colour.

```js
import { createCapabilities } from '@oriel-art/capabilities';
import { createMetadata } from '@oriel-art/metadata';
import { createDiscovery, registerDiscovery } from '@oriel-art/artist-sdk/discovery';

// manifest is a parsed artwork.json document; artwork is an existing SDK artwork.
const capabilities = createCapabilities(manifest.capabilities);
const metadata = createMetadata(manifest.metadata);
capabilities.getCapabilities();
metadata.getMetadata();
metadata.getProvenanceReferences();

const discovery = createDiscovery(manifest);
const unregister = registerDiscovery(artwork, discovery);
// A connected iframe viewer can now call client.query('discovery').
// Dispose these registrations when the integration is removed:
unregister();
```

The SDK aliases `@oriel-art/artist-sdk/capabilities` and
`@oriel-art/artist-sdk/metadata` expose the same typed APIs. Existing root exports,
artwork creation, recipes, state, rendering, info panels, and bridge protocol
remain unchanged. Registration checks artwork ID and version and rejects query
name conflicts without leaving partial registrations. No metadata or capability
claim is inferred from the presence of an SDK renderer.

## Capability contract (schemaVersion: "1.0")

`technical.rendering` requires pixel `width` and `height` ranges, `maxPixels`,
and a nonempty array of MIME `formats` (for example `image/png`). Optional
`aspectRatios` are width divided by height; omission permits any ratio within
the other limits. All ranges are
inclusive. Pixel dimensions and budgets must be positive safe integers.

### Integer export dimensions and aspect ratios

`aspectRatioRounding` configures each rendering constraint independently:

| Policy | Acceptance for declared ratio `r` |
| --- | --- |
| `nearest` (default) | `height === Math.round(width / r)` **or** `width === Math.round(height * r)` |
| `strict` | `Math.abs(width / height - r) <= 1e-6 * r` (the previous behavior) |

The default models an export that fixes either width or height and rounds the
derived dimension to the nearest integer. Positive half-pixel ties round up.
It does not stretch, crop, resize, or change a request. For `r = 1512 / 803`,
fixing width at 2048 gives a rounded height of 1088, so **2048 × 1088 passes**;
2048 × 1087 and 2048 × 1089 fail. Portrait ratios and height-anchored exports
use the same rule. At small sizes a half-pixel difference may be a substantial
relative error; set an appropriate minimum size or choose `strict` when needed.

```js
const rendering = {
  width: { min: 64, max: 8192 }, height: { min: 64, max: 8192 },
  maxPixels: 16777216, formats: ['image/png'],
  aspectRatios: [1512 / 803], aspectRatioRounding: 'nearest'
};
```

Declare the policy next to `aspectRatios` under `technical.rendering` or
`artist.rendering`. A policy without a ratio list in that same constraint is
invalid. There is no inheritance between technical and artist constraints:
each must pass its own policy, and a strict artist constraint can still reject
a rounded export. Callers cannot override the policy in a request. Dimension,
pixel-budget, format, and print constraints still apply without rounding slack.

This changes the default from the initial proposal's relative `1e-6` test.
To preserve that behavior, set `aspectRatioRounding: 'strict'` on every ratio
constraint. Older validators that reject unknown fields need updating before
reading a description with the new field. The schema remains `1.0` during this
unpublished proposal; no already-published package or schema is being replaced.

### Print and feature declarations

Optional `technical.print` declares physical `width` and `height` ranges in
**inches**, a `dpi` range, and optional `tiling`. Print requests may use `in`,
`cm`, or `mm`; the validator converts them to inches and rounds physical size
times DPI to whole pixels. Both rounded dimensions must equal the requested
pixel dimensions. A tiling request still describes the **entire final image**:
it does not bypass the total pixel budget or dimension limits. Tile scheduling,
overlap, stitching, color profiles, and actual exports belong to the renderer.

Optional feature declarations are:

| Section | Boolean support fields |
| --- | --- |
| `technical.interaction` | `pointer`, `keyboard`, `touch` |
| `technical.animation` | `supported`, `pause`, `seek` |
| `technical.state` | `save`, `restore`, `deterministic` |

Omitted or false feature flags do not advertise support. A request flag of
`false` imposes no requirement. State flags describe the artwork's own behavior;
the SDK does not prove determinism or add simulation replay.
Declaring pause or seek requires `technical.animation.supported: true`.

`artist.rendering` and `artist.print` accept partial limits of the corresponding
shape. Both technical and artist limits apply; an artist value cannot relax a
technical bound. `artist.notes` is descriptive plain text, not an executable
policy. Policies that require code should use `evaluation: "required"` and an
explicit evaluator. No artist constraint is silently coerced or waived.

### Renderer support, mode availability, and viewer access

A renderer's complete feature set is an internal upper bound. Publish a
capability snapshot describing what the artwork actually makes available in its
**current mode**. Then use the existing bridge manifest's `commands` and `queries`
to discover what an external viewer can invoke. A capability flag never registers
an operation, grants permission, or bypasses `published` mode locks.

The mode example makes these distinctions explicit:

| Concern | Renderer supports | Local studio availability | Example collector availability | Viewer bridge |
| --- | --- | --- | --- | --- |
| Parameter editing | Artist-owned parameter inputs | `artwork.setParameters()` | Locked (`published` SDK mode) | No mutation command registered |
| Seeking | Renderer can evaluate saved elapsed time | Advertise `animation.seek: true` for a wired local control | Advertise `seek: false` | No seek command registered |
| Recipe capture | Seed, parameters, validated frame context | `state.save: true` | `state.save: true` | Only explicitly registered queries; recipe context must be captured by artist code |
| Recipe restoration | Artist can restore saved inputs | `state.restore: true` | `state.restore: false` | No restore command registered |
| Print screening | Artist-owned export/inspection path | Fixture print limits and required evaluation | Print section omitted | No export or evaluation command registered |

Collector is an application concept, mapped to the SDK's existing `published`
mode in the example. Its particular restrictions are illustrative, not assertions
about Kepler's actual collector UI. Parameter editing is not represented by an
interaction flag: `pointer: true` does not imply editing or remote access.

Keep the complete renderer description separate from the mode-specific document.
For a static sidecar, describe that deployed entry point's mode; if one entry
point may start in several modes, publish only their common guarantees and query
the actual runtime before relying on mode-dependent features. Do not advertise
the union of studio and collector abilities as universally available. There is
no `scope` field in the current schema; the existing bridge manifest's `mode`,
deployment context, and the artist's integration contract establish that scope.

Provider snapshots and registered queries are fixed. If the application changes
mode, unregister the old discovery queries, create a new mode-specific provider,
and register it. The SDK artwork's own `mode` is fixed at creation; recreate the
artwork to change its locking behavior. If operation registrations change,
reconnect the bridge so the viewer receives a fresh operation manifest.

### State replay is not pixel identity

For a Kepler-like replay claim, advertise `state: { save: true, restore: true }`
in modes that expose those operations and document the saved inputs:

- Artwork/generator version, seed, and resolved parameters.
- Elapsed time, cadence, and composition aspect ratio in versioned recipe context.
- Any additional artist-owned simulation state needed for that renderer.

This promises capture/restoration of the documented composition and frame state.
It does not establish equal pixels across GPUs, browsers, shaders/compiler
versions, precision settings, output dimensions, or colour pipelines. Recipe
import validates and restores inputs; the artist must explicitly restore/draw
the renderer. The supplied example uses `fromRecipe()` to demonstrate input
replay, not to claim a rendered pixel comparison.

The legacy `deterministic` boolean has no standardized environment or fidelity
descriptor. Leave it unset when the evidence is only state/composition replay;
requests demanding it will then fail as undeclared. Existing descriptions may
still use it under an explicit artist contract, but consumers must not infer
cross-device or pixel-identical rendering from that flag. If pixel identity is
needed, separately specify and test the exact renderer/environment, resolution,
time/state, and comparison method. Neither a saved recipe nor a successful
capability validation supplies that evidence.

## Request validation and evaluation

`validateRequest(capabilities, request)` and a provider's
`validateRequest(request)` are synchronous and side-effect free. Every request
requires positive integer pixel `width`, `height`, and a MIME `format`, with
optional `print`, `interaction`, `animation`, and `state` requirements.

Results contain `status` and `issues`:

| Status | Meaning |
| --- | --- |
| `supported` | Passes the supplied declarations; does not guarantee successful rendering |
| `unsupported` | Invalid request or violation of one or more declared constraints |
| `requires-evaluation` | Passes static checks, but the artist requires runtime evaluation |

Issues have `source` (`request`, `technical`, `artist`, or `runtime`), a stable
machine-readable `code`, field `path`, and human-readable `message`. Codes include
`INVALID_REQUEST`, `OUT_OF_RANGE`, `PIXEL_LIMIT`, `FORMAT`, `ASPECT_RATIO`, `TILING`,
`UNDECLARED`, `PRINT_RESOLUTION`, and `EVALUATION_REJECTED`.
Malformed capability descriptions throw `INVALID_INPUT` or `LIMIT`; malformed
requests return an `INVALID_REQUEST` issue. Nothing is rendered or allocated
based on requested image dimensions during validation.

```js
const provider = createCapabilities(manifest.capabilities, {
  evaluate: async (request, { capabilities, signal }) => {
    // Artist-supplied runtime check; honor signal for cancellable work.
    return { supported: request.width * request.height <= 8_000_000,
      reasons: ['Current device has an eight-million-pixel budget.'] };
  }
});
const result = await provider.evaluateRequest(
  { width: 2400, height: 2400, format: 'image/png' },
  { timeout: 5000 }
);
```

Providers expose `evaluateRequest` only when an evaluator was supplied.
Providers validate and snapshot capabilities once, then validate only the request
on each call. Standalone APIs still fully validate incoming descriptions.
The standalone `evaluateRequest(capabilities, request, evaluator?, options?)`
also works without a hook and preserves `requires-evaluation`. Static rejection
always wins and skips the hook. Runtime hooks may narrow an otherwise valid
request; they receive isolated copies and cannot override static limits.
Errors from artist hooks propagate; invalid decisions throw `INVALID_INPUT`.
Cancellation throws `CANCELLED`, and timeout throws `TIMEOUT`. Neither implies
that the renderer supports the request. The default timeout is 5000 ms, with a
maximum of 60000 ms. The deadline is checked before invoking the hook and before
accepting its result, so blocking synchronous code or a saturated microtask queue
cannot cause an overdue result to be accepted. Abort signals are passed to the hook.

At most four hooks may be active for the same evaluator function within a loaded
module instance. Excess calls reject immediately with `BUSY`; no unbounded queue
is created. Standalone calls and providers sharing that function share the limit.
Cancelled or timed-out hooks retain their slots until the underlying work settles.
Reusing the same evaluator function across calls preserves this bound; creating
new functions or loading separate module copies creates separate limits.

Deadlines cannot preempt synchronous JavaScript or force a noncooperative hook
to stop. A hook that never settles keeps its slot occupied. Expensive or untrusted
hooks should run in a worker that the host terminates on cancellation; global
application concurrency and external-service budgets remain the host's responsibility.
Hooks should not mutate artwork state.

### Print acceptance and saved-frame screening

For reusable integration, `createPrintWorkflow()` accepts an artwork, declared
policy, synchronous capture callback and stable inspector. See the
[print workflow pilot](print-workflow-pilot.md) for physical specifications,
saved records, operating limits and the Mihira trial. It does not record proof
decisions. The older mode example below remains a scoped workflow illustration.

Static validation checks declared output limits, integer dimensions, and DPI
consistency. Even a runtime `supported` result is acceptance by the supplied
checks, **not artist approval or a guarantee of physical print quality**.

In `modes-and-print.mjs`, `createSavedPrintJob()` captures the recipe (including
frame context) and requested output together, then creates an evaluator bound to
that snapshot. Its artist-owned `inspect({ recipe, request, signal })` callback
receives isolated copies. Changes to live parameters, time, the caller's frame
object, or output request cannot change the job being screened. Creating another
composition/frame/output requires a new job and a new evaluation; a result must
not be reused as blanket approval for another seed, frame, size, or print process.

The helper accepts artworks created by `createModeExample()` and preserves the
capability snapshot registered for that artwork. Saved frame ratios must belong
to both the technical and artist declarations; frame input cannot create new
permissions. This fixed-composition example rejects a different frame ratio with
`ASPECT_RATIO`. Supporting other compositions requires an artist-defined policy
and consistent discovery for those compositions. Output requests outside declared
limits still produce an `unsupported` result without calling the inspector.

Request and frame inputs are copied through the SDK's bounded, data-only snapshot
utility before recipe creation or reporting, with an 8 KiB budget each. Oversized
or unsafe input throws `LIMIT` or `INVALID_INPUT`; malformed request fields throw
`INVALID_REQUEST` at job creation. Accessors and `toJSON` hooks are not invoked.

The example also limits inspection to four active calls across all jobs sharing
the same `inspect` function in one loaded module. Excess calls fail with `BUSY`
without queuing. Timeout or cancellation does not free an inspection slot until
the underlying work settles; successful and failed inspections both release it.
Reuse one stable inspector function for each shared rendering resource. Separate
functions, module copies, and processes need a host-level resource budget; use
terminable workers for work that does not cooperate with cancellation.

```js
const job = createSavedPrintJob(studioArtwork, {
  frame: { elapsedSeconds: 12.5, cadence: 1, aspectRatio: 1512 / 803 },
  request: { width: 2048, height: 1088, format: 'image/png',
    print: { width: 8, height: 4.25, unit: 'in', dpi: 256 } },
  inspect: inspectSavedFrame // Artist-owned isolated rendering/inspection.
});
const report = await job.screen();
// report.job contains the exact saved recipe and requested output.
// report.screening is the negotiation result; report.printApproval stays 'not-granted'.
```

The callback contract in this example requires explicit grain, line-weight, and
colour check results. The runnable fixture deliberately leaves colour unpassed,
so runtime screening rejects it while dimension/DPI preflight passes. This is
workflow plumbing, not an implementation of image-quality measurement. In a real
integration, inspect the exact saved frame at the requested physical scale and
use an isolated renderer/worker so live playback remains unchanged.

Physical proofing and approval remain a separate artist/printer process tied to
the same saved composition/frame, size, paper, printer, colour profile, rendering
intent, and other relevant conditions. Record those conditions and the approval
separately in the print job system. `printApproval` is an example report field,
not a new SDK schema field. The fixture limits here and those reported in the
Kepler trials are not approved artwork print specifications.

## Metadata contract (schemaVersion: "1.0")

`project` requires an `id`, `title`, and nonempty `creators` list. Creators have
a `name`, optional `role`, and optional descriptive `references`. Optional project
fields are `description`, `medium`, `date`, `artistStatement`, and `license`.
Dates use calendar-valid `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` strings.

An optional `edition` has its own required `id`, optional positive integer
`number` and `total`, and optional project-like descriptive fields. Edition
number cannot exceed total. Project and edition data remain separate: callers
choose what to display without implicit license, creator, or provenance merges.
A license has a required `name`, optional `uri`, and optional `text`. License
omission is not a grant of permission.

Title, description, medium, artist statement, and license text accept plain
strings or locale-to-string maps. Locale keys use BCP 47 syntax supported by
`Intl.getCanonicalLocales`. `getMetadata()` retains every translation.
`resolveLocalizedText(value, locale?, defaultLocale?)` selects an exact locale
(case insensitive), then its bare language, then the document's supplied
default locale, then the first declared translation. No translation is generated.

`provenance` is an optional list returned by `getProvenanceReferences()` (an empty
list when omitted). Each reference has `kind` (`identity`, `blockchain`,
`archive`, or `other`), `uri`, and optional plain-text `label`. Allowed URI schemes
are HTTP(S), IPFS, AR, DID, and URN, without embedded username/password credentials.
These are unverified artist-provided references, not evidence of authorship,
ownership, wallet control, authenticity, archival availability, or identity.
The SDK never resolves or fetches them. Reference URIs may carry scheme-specific
chain or archive identifiers without blockchain indexing or wallet integration.

## One discovery envelope, two access paths

The versioned discovery document is:

```json
{
  "schemaVersion": "oriel-artwork/1.0",
  "artwork": { "id": "example", "version": "1.0.0" },
  "metadata": { "schemaVersion": "1.0", "project": {
    "id": "example", "title": "Example", "creators": [{ "name": "Artist" }]
  } }
}
```

At least one of `metadata` and `capabilities` must be present. Unknown fields and
versions are rejected in this initial schema rather than silently interpreted.
Package versions and schema versions are independent. Future schema changes
require explicit version handling; there are no speculative migrations.

**Static:** distribute a UTF-8 `artwork.json` sidecar and advertise it in HTML:

```html
<link rel="oriel-artwork" type="application/vnd.oriel.artwork+json" href="./artwork.json">
```

Use the declared media type when hosting, or `application/json` for hosts that
cannot configure custom types. A crawler reads the link/sidecar and calls
`parseDiscovery(jsonText)` without loading scripts or importing artwork code.
The parser accepts JSON text or a parsed data object; it does not fetch URLs.
Hosts control URL resolution, request/response bounds, redirects, and allowed
origins. Do not crawl reference URIs implicitly.

For embedded metadata, use a non-executable script element whose `id` is
`oriel-artwork` and `type` is `application/json`, with the full discovery envelope
as its text. Generate that text with `serializeDiscovery(manifest)`, which escapes
`<` and Unicode line separators, including embedded `</script>` sequences.
Serialization rejects documents whose escaped text would exceed the parser limit.
Read its text and pass it to the same parser. Do not embed raw `JSON.stringify`
output in HTML. The sidecar is the preferred archive and static inspection path.

**Runtime:** `createDiscovery(manifest, { evaluate? })` exposes `getDiscovery()`
and the APIs corresponding to present sections. `registerDiscovery(artwork,
provider)` installs read-only `discovery`, `metadata`, `capabilities`, and
`provenance` queries as applicable. Register before exposing the iframe bridge
so the initial bridge manifest advertises them. `client.query('discovery')`
returns the same validated envelope in its usual `{ result, revision }` response.
Static and runtime data should be generated from the same source. The SDK does
not reconcile independently edited files or assert cryptographic equivalence.

Negotiation is local to the capabilities/discovery provider. It is deliberately
not registered as an arbitrary remote evaluator through the existing bridge;
viewers can validate fetched capabilities locally. An artist can add a separate
explicit operation if remote runtime negotiation is required. Existing origin
allowlists, session handling, message limits, and operation validation still apply.

## Data boundaries and deferred work

The implementation rejects functions, accessors, custom prototypes, symbols,
nonfinite numbers, cycles, sparse arrays, and prototype-pollution keys. It never
calls `toJSON`. Inputs must be ordinary data; JavaScript proxies are not an
untrusted-data transport or a sandbox. Unknown fields are rejected. Provider
inputs are snapshotted; every returned description is an independent copy.

Descriptions are limited to 32 KiB of compact UTF-8 JSON each; discovery text
and envelopes to 48 KiB; requests and evaluator decisions to 8 KiB. Data is also
bounded to depth 20 and 5000 visited values. Discovery fits the bridge's existing
64 KiB response limit. Metadata text is plain text, never interpreted as HTML,
Markdown, instructions, or executable code. Consumers should render text with
`textContent` and treat artist claims as untrusted descriptive data.
The JSON byte budget is charged during traversal, including keys, escaped control
characters, lone surrogates, punctuation, and every occurrence of repeated values.
Oversized input is rejected before full serialization or UTF-8 buffer allocation.
Discovery text receives a length check before its bounded UTF-8 size check.

Identity verification, wallet authentication, identity attestations, blockchain
indexing, and an Oriel identity registry are out of scope. There is no publishing,
network crawler, enforcement inside an artist renderer, automatic export,
cryptographic signing, or authenticity guarantee in these packages.

The implementation uses the brief supplied in this session; the referenced
earlier full architecture/security/acceptance brief was not present. Explicit
design choices for review are the `1.0` schemas, inches as canonical print units,
the three validation statuses, strict unknown-field rejection, immutable provider
snapshots, and opt-in bridge registration.
