# Print workflow pilot for Mihira

`createPrintWorkflow()` is an experimental reusable API exported by
`@oriel-art/capabilities` and `@oriel-art/artist-sdk/capabilities`. It captures one
composition, frame, output request and physical print specification, then runs
artist-owned checks against that snapshot. It replaces the need to copy the
workflow plumbing from `examples/discovery/modes-and-print.mjs`.

The artist defines the constraints and screening criteria. The SDK captures the
job, validates declared limits and records the supplied checks. A `supported`
result means those checks passed for this saved job. A downstream print function
can use the exported image and accompanying report directly; the SDK adds no
approval step. Rendering, ICC transformations and any measurements needed by the
artist's checks belong to the integration. Replay across devices depends on the
renderer and the artist's recipe contract.

Run the complete fixture with `node examples/print-workflow/main.mjs`. All print
limits and specifications in that example are illustrative, not approved Kepler
specifications. Its checks report `not-assessed`, so screening remains
`requires-evaluation` until the supplied checks have been performed.

## Integration

Create a workflow once for the current artwork and its declared mode-specific
policy. Supply an artist-owned synchronous capture callback and reuse a stable
inspector function for each shared renderer/service. No discovery or bridge
operations are added automatically.

```js
import { createPrintWorkflow } from '@oriel-art/capabilities';

const workflow = createPrintWorkflow({
  artwork,
  capabilities: declaredStudioCapabilities,
  capture: art => ({
    recipe: art.getRecipe(),
    frame: {
      elapsedSeconds: playback.elapsedSeconds,
      cadence: playback.cadence,
      aspectRatio: composition.aspectRatio
    },
    uniforms: captureUniformsAsPlainJSON()
  }),
  inspect: inspectSavedPrint // Reuse this function across jobs/workflows.
});

const job = workflow.captureJob({
  id: 'candidate-001',
  request: proposedOutput, // width/height pixels, format, physical width/height/unit/DPI
  specification: {
    paper: selectedPaper,
    printer: selectedPrinterAndProcess,
    colourProfile: selectedProfileIdentifier,
    renderingIntent: selectedRenderingIntent,
    grain: artistGrainCriterion,
    lineWeight: artistLineWeightCriterion
  }
});

// Capture has already completed. Live edits cannot change this job.
const report = await job.screen({ signal: abortController.signal, timeout: 5000 });
const downloadableJSON = JSON.stringify(report, null, 2);
```

`declaredStudioCapabilities`, the selected physical conditions, renderer and
criteria come from the integration. Declare proposed print limits for an
explicit pilot mode only when the artist/printer has chosen those limits; keep
public/collector print support undeclared until it is appropriate to advertise.
If print support is absent, `captureJob()` rejects without invoking capture.
The library does not invent print support to make a workflow pass.

### External input boundary

For external print-job candidates, pass **raw JSON text** containing
`{ id, request, specification }` to `workflow.captureJob(text)`. The SDK rejects
text over **20 KiB of UTF-8 before `JSON.parse`**, then applies the existing
8 KiB component limits, structural checks and capability policy. Unknown
top-level fields are rejected. This is a candidate-input path, not a saved-report
import or automatic recipe-restoration API.

Also enforce a limit while reading the transport or file, before constructing
the string. For a browser File containing a candidate:

```js
if (file.size > 20 * 1024) throw new RangeError('Print candidate exceeds 20 KiB');
const job = workflow.captureJob(await file.text());
```

For HTTP, limit the decoded request body while reading it; a claimed
`Content-Length` alone is insufficient. Do not call an unbounded `.json()` first,
or stringify an already oversized object to reach the string API. Apply ingress
limits to external policy/inspection data too.

The object overload is retained for trusted in-process inputs. Its quotas bound
accepted snapshots, not all CPU/memory needed to enumerate an arbitrary existing
object. Wide enumerable objects now fail before the copier explicitly creates
a complete key array, but engines may allocate their own enumeration state;
objects with many hidden/symbol keys still require a complete key check. Objects
and proxies are therefore not a substitute for a bounded external transport.

### Structured print conditions

The original `paper`, `printer`, `colourProfile`, `grain`, `lineWeight` and
`renderingIntent` fields remain required for compatibility and human-readable
descriptions. Optional structured fields preserve the settings behind those
descriptions; they share the specification's existing 8 KiB total budget.

| Field | Structure and meaning |
| --- | --- |
| `media` | Optional `manufacturer`, `stock`, `finish`, `inkSet` strings; positive `weightGsm`; `settings` JSON object for driver settings |
| `iccProfile` | `{ name, sha256 }`; SHA-256 of the exact ICC file bytes as 64 lowercase hex characters |
| `blackPointCompensation` | Explicit boolean; omission means unspecified, not false |
| `borders` | `{ unit, top, right, bottom, left }`; unit is `in`, `cm` or `mm`, all sizes finite and nonnegative |
| `colourCriteria` | Nonempty array of `{ metric, maximum, unit, method }`; maximum is finite and nonnegative |
| `extensions` | JSON object; use namespaced keys such as `art.kepler.print.v1` for integration-specific conditions or criteria |

Borders describe space **outside the image area**. `request.print.width/height`
continue to describe the image and determine its pixel/DPI relationship. Borders
do not add pixels or silently change those dimensions. Sheet size, printable
area and margin feasibility must be checked by the inspector/printer separately.

The SDK validates structure, not whether a driver supports a setting, a profile
is correct, or a measurement passes a criterion. The inspector must use these
conditions, verify profile bytes when supplied, and record its evidence. Keep
the descriptive profile label consistent with `iccProfile`. Do not invent a hash
or numerical colour threshold when the profile or acceptance method is unresolved;
omit those optional fields and return `not-assessed`. The same applies to
unspecified black-point compensation and border settings. Richer colour metrics
can use an integration-owned schema inside `extensions`.

### Capture contract

The callback receives the artwork and isolated `{ request, specification }`
copies. It must return synchronously and avoid mutating live state or doing
expensive rendering. The returned object contains:

- `recipe`: a plain JSON object with `artworkId` and `artworkVersion` matching the
  artwork, plus the artist's replay inputs. Recipe schema/restoration remains
  the artist's responsibility; the helper does not instantiate a renderer.
- `frame`: a plain JSON object with positive `aspectRatio` (`width / height`),
  plus artist-defined playback/cadence/context fields.
- Optional `uniforms`: a plain JSON object. Convert typed arrays to ordinary
  arrays when capturing them.

Capture the inputs that describe the same moment. If the renderer has not drawn
recent parameter edits, choose explicitly whether the job describes the visible
frame or a newly resolved composition. The SDK cannot infer that relationship.
Shader/source versions and any other restoration requirements can be included
in recipe/frame data under the integration's own versioned contract.

All data-only snapshots normalize numeric `-0` to positive `0`, including nested
recipe, frame, uniform and specification values. Inspectors receive the normalized
values, so JSON persistence does not silently change the screened inputs. Caller
objects are not mutated. If a renderer relies on zero's sign, encode that sign
explicitly in its versioned capture contract and restore it in the renderer.

Frame ratios must appear in both declared ratio lists where those lists exist.
Use the policy's original numeric ratio, not the ratio of rounded output pixels.
The helper narrows output validation to that captured ratio while retaining the
declared rounding modes and all other limits. A request allowed for a different
composition cannot be screened against this frame.

### Inspector contract

`inspectSavedPrint(jobRecord, { signal })` receives an isolated copy of the entire
job, including physical conditions. Restore/render from this data in an isolated
renderer or worker. Apply device-capacity checks before allocation and use the
integration's own colour-managed export path. The SDK does not fetch colour
profiles or interpret profile identifiers.

Return explicit outcomes for all three checks:

```js
return {
  grain: { status: 'passed', notes: grainEvidence },
  lineWeight: { status: 'failed', notes: lineWeightEvidence },
  colour: { status: 'not-assessed', notes: 'Profile and measurement conditions remain unresolved.' }
};
```

All three must be `passed` for `supported`. Any `failed` check produces
`unsupported`; otherwise any `not-assessed` check produces `requires-evaluation`.
Pending checks retain `NOT_ASSESSED` issues with paths such as `checks.colour`,
including when another failed check makes the overall result unsupported.
Omissions, unknown statuses and malformed results throw. Notes are optional
descriptive text, not a verification system.

Legacy `{ passed: true/false }` checks still work and retain their original report
shape. `false` means failed; it cannot distinguish an unperformed assessment.
Migrate unassessed checks to `{ status: 'not-assessed' }`. Supply exactly one of
`status` or `passed` on each check; mixing them is rejected, even if they agree.
Without an inspector, validation and screening return `requires-evaluation`,
even if the input policy marks generic runtime evaluation optional.

The report contains `job`, `screening`, and optional `checks`.
Concurrent screens keep their evidence separate. Inspection failures, timeouts
and cancellation reject the call; they do not produce a successful report.

### Migrating earlier pilot reports

The experimental `printApproval: 'not-granted'` field has been removed from
runtime reports, TypeScript declarations and the older saved-print example.
Remove that field from consumer types, report-schema requirements, UI and print
gating logic. Use `screening.status`, `screening.issues` and optional `checks` to
show what was assessed. The SDK does not introduce a replacement approval field
or require a physical proof before printing.

Previously saved reports may still contain the field; consumers can ignore it.
Keep original report bytes when checking an existing digest. The captured job
schema (`oriel-print-job/1.0`) is unchanged; the removed field belonged to the
surrounding report.

### Records, limits and operating behavior

`job.getJob()` returns an isolated, JSON-serializable record with schema version
`oriel-print-job/1.0`, the caller's job ID, artwork identity, original capability
policy, request, specification and capture. The ID is a descriptive label, not
a unique or authenticated identifier. Store the full record alongside the image.
On reopening, use the artist's loader with `capture.recipe`, `capture.frame` and
`capture.uniforms` together. There is no automatic record import or restoration
API in this pilot; validate imported data and recheck the current trusted policy
before creating a new job.

### Detailed rejection issues

Constraint rejection errors retain their existing `code` and `message` and now
include an isolated `issues` array using the standard `{ source, code, path,
message }` shape. This applies to capability preflight, malformed request fields,
missing print dimensions and captured-ratio/output disagreement. For example,
an oversized request can report `technical / PIXEL_LIMIT / width` alongside an
`artist / OUT_OF_RANGE / print.dpi` issue.

```js
try {
  const job = workflow.captureJob(candidate);
  // Continue with this saved job.
} catch (error) {
  if (Array.isArray(error.issues)) {
    showConstraintIssues(error.issues); // Render messages as text.
  } else {
    showCaptureError(error); // Unsafe data, byte limits or artist callback errors.
  }
}
```

### Replay and image-linking pattern

Use an integration-owned versioned descriptor inside `capture.frame`, alongside
the time/cadence/aspect fields. For example, `frame.replay` can contain:

```js
{
  contract: { id: 'kepler-print-replay', version: '1' },
  renderer: { id: rendererId, version: rendererVersion },
  source: { revision: sourceRevision, sha256: sourceBundleDigest },
  sdkCommit,
  environment: { browser: browserBuild, backend: rendererBackend }
}
```

These are integration-supplied values, not verified SDK claims. Define which
source bundle is hashed, including shader source and relevant assets, and how
it is built. The descriptor does not embed executable code or authorize loading
an arbitrary recorded URL.

For a replay, the integration should:

1. Bound imported file sizes before reading, then validate the report/recipe/frame
   schemas, units, uniform types and artwork identity using trusted local contracts.
2. Compare the recorded replay contract, renderer version and source digest with
   the installed renderer and trusted build artifacts. Reject unsupported versions
   or explicitly report migration; do not silently claim an exact replay.
3. Recheck current trusted capabilities and device capacity. Never treat a policy
   embedded in an imported record as permission or a resource budget.
4. Restore recipe, frame and uniforms into an isolated renderer. Check that they
   describe the same composition, including seed, resolved parameters, cadence,
   elapsed time and aspect ratio. Reapply the recorded print settings explicitly.
5. Compare output under the recorded environment where available. Byte equality
   there is evidence for that environment, not a guarantee across devices.

Link the exact exported image and exact saved report bytes with a separate
sidecar index. Keeping the index separate avoids a self-referential report hash.
For browsers with Web Crypto, this integration helper hashes bounded blobs:

```js
async function sha256(blob, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || blob.size > maxBytes) {
    throw new RangeError('Artifact exceeds the integration byte budget');
  }
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

// exportedPNG must come from this saved job's isolated render.
const reportBlob = new Blob([JSON.stringify(report)], { type: 'application/json' });
const index = {
  jobId: report.job.id,
  report: { sha256: await sha256(reportBlob, reportByteBudget), bytes: reportBlob.size },
  image: { sha256: await sha256(exportedPNG, imageByteBudget), bytes: exportedPNG.size,
    mimeType: exportedPNG.type, width: report.job.request.width, height: report.job.request.height }
};
// Save reportBlob, exportedPNG and JSON.stringify(index) together.
```

Before associating imported files, verify both hashes against the saved index,
check decoded image dimensions, and use the original saved report bytes rather
than reserializing parsed JSON. Limits, schema checks, replay validation and
image decoding remain integration code. Digests detect byte changes relative to
the index; they do not authenticate the index or verify authorship.

Changing composition, frame, output, paper, printer, profile or criteria requires
a new captured job so the screening results describe the output being produced.

| Boundary | Limit / behavior |
| --- | --- |
| External candidate JSON text | 20 KiB UTF-8 before parsing; caller also bounds transport/file reads |
| Request and specification | 8 KiB each; validated before capture |
| Capture | 64 KiB; bounded data-only snapshot |
| Complete job | 128 KiB; maximum depth 20 and 5,000 nodes |
| Inspector results | 8 KiB; notes up to 2,000 characters per check |
| Inspector concurrency | Four active calls per stable inspector function per loaded module, across jobs and workflows |
| Overload | Immediate `BUSY`, no queue |
| Deadline | Default 5 seconds, configurable up to 60 seconds |

Data boundaries reject accessors, functions, typed arrays, unsafe keys and
oversized structures without calling `toJSON`. Policy violations throw
`UNSUPPORTED` before capture; output/captured-frame disagreement throws
`ASPECT_RATIO`; malformed data throws `INVALID_INPUT`, `INVALID_REQUEST` or
`LIMIT` as appropriate. Artist callback errors propagate.

Timed-out or cancelled inspectors keep capacity until their actual work settles.
Every admitted inspector releases capacity on settlement, including failures.
Use terminable workers for noncooperative expensive work; synchronous callbacks
cannot be preempted. Function wrappers, separate module copies, processes and
machines need a host-level resource/service budget. The cap is not a rate limit
or a distributed cost-control service.

## Capture-and-screen integration checks

1. Supply artist-defined output limits, print settings and screening criteria.
   Clearly label any fixture values used to test the integration.
2. Integrate the capture callback with Kepler's existing recipe/frame/uniform
   export capture. Confirm no live state changes during capture or screening.
3. Start screening, change live parameters/time, then confirm the report and
   isolated export still describe the captured job. Repeat from saved inputs in
   the same environment; record browser, GPU and SDK commit with the evidence.
4. Exercise overload, cancellation, a failing inspector and recovery. Confirm
   collector discovery remains read-only and print support is not added there.
5. Save the report alongside the exported image and verify their digest links.
   Confirm the downstream print function can use the exported image without
   an SDK approval field.

Repository fixtures test snapshot isolation and browser rendering behavior. The
team has also reported successful Kepler integration, including saved-job replay
after live edits. Its retest of `93d28e1` confirmed input rejection before parsing
or capture, signed-zero normalization, byte-identical PNG replay, cancellation
recovery and collector isolation. These are reported integration results, not
independently reproduced artwork source or a retest of the subsequent report-field
removal. The capture-and-screen pilot is complete for the agreed scope. Physical
printing and additional device trials are optional integration work, not SDK
completion requirements.
