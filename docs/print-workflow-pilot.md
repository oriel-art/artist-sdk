# Print workflow pilot for Mihira

`createPrintWorkflow()` is an experimental reusable API exported by
`@oriel-art/capabilities` and `@oriel-art/artist-sdk/capabilities`. It captures one
composition, frame, output request and physical print specification, then runs
artist-owned checks against that snapshot. It replaces the need to copy the
workflow plumbing from `examples/discovery/modes-and-print.mjs`.

The SDK records and screens candidates. **Physical proof decisions stay outside
the SDK.** It does not apply ICC transformations, render implicitly, measure grain
or line weight, verify identities, approve a printer, or promise pixel identity
on another device. A `supported` result means the supplied checks passed for
this saved job. Every report retains `printApproval: 'not-granted'`.

Run the complete fixture with `node examples/print-workflow/main.mjs`. All print
limits and specifications in that example are illustrative, not approved Kepler
specifications. Its checks deliberately fail because no physical criteria have
been evaluated.

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
  grain: { passed: grainPassed, notes: grainEvidence },
  lineWeight: { passed: lineWeightPassed, notes: lineWeightEvidence },
  colour: { passed: colourPassed, notes: colourEvidence }
};
```

Use `false` when a criterion has failed or has not yet been checked, with notes
explaining which. All three must pass for `supported`; omissions and malformed
results throw. Notes are optional descriptive text, not a verification system.
Without an inspector, validation and screening return `requires-evaluation`,
even if the input policy marks generic runtime evaluation optional.

The report contains `job`, `screening`, optional `checks`, and `printApproval`.
Concurrent screens keep their evidence separate. Inspection failures, timeouts
and cancellation reject the call; they do not produce a successful report.

### Records, limits and operating behavior

`job.getJob()` returns an isolated, JSON-serializable record with schema version
`oriel-print-job/1.0`, the caller's job ID, artwork identity, original capability
policy, request, specification and capture. The ID is a descriptive label, not
a unique or authenticated identifier. Store the full record alongside the image.
On reopening, use the artist's loader with `capture.recipe`, `capture.frame` and
`capture.uniforms` together. There is no automatic record import or restoration
API in this pilot; validate imported data and recheck the current trusted policy
before creating a new job. An imported record is not authority to print.

Changing composition, frame, output, paper, printer, profile or criteria requires
a new captured job. Proof approval belongs in the external artist/printer system
with the exact job and print conditions attached. No approval-record API is
included in this pilot.

| Boundary | Limit / behavior |
| --- | --- |
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

## Mihira trial

1. Agree on one proposed physical size, paper/printer/profile/intent combination,
   and explicit grain/line-weight/colour criteria. Record them as pilot conditions.
2. Integrate the capture callback with Kepler's existing recipe/frame/uniform
   export capture. Confirm no live state changes during capture or screening.
3. Start screening, change live parameters/time, then confirm the report and
   isolated export still describe the captured job. Repeat from saved inputs in
   the same environment; record browser, GPU and SDK commit with the evidence.
4. Exercise overload, cancellation, a failing inspector and recovery. Confirm
   collector discovery remains read-only and print support is not added there.
5. Produce and inspect a physical proof. Record pass/fail decisions externally,
   linked to the saved record, and report which SDK fields or callback steps
   caused duplicated work or ambiguity.

Repository fixtures test snapshot isolation and browser rendering behavior. They
do not establish real-device portability or physical print quality. The physical
trial and Kepler integration remain work to perform with Mihira.
