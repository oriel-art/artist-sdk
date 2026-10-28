import { createCapabilities, createPrintWorkflow, type Capabilities, type RenderRequest, type PrintSpecification, type PrintRequest, type PrintScreeningReport } from '@oriel-art/capabilities';
import { createMetadata, type Metadata } from '@oriel-art/metadata';
import { createDiscovery, parseDiscovery, registerDiscovery } from '@oriel-art/artist-sdk/discovery';
import { getCapabilities } from '@oriel-art/artist-sdk/capabilities';
import { resolveLocalizedText } from '@oriel-art/artist-sdk/metadata';

const capabilities: Capabilities = { schemaVersion: '1.0', technical: { rendering: {
  width: { min: 1, max: 4096 }, height: { min: 1, max: 4096 }, maxPixels: 4096 ** 2, formats: ['image/png'],
  aspectRatios: [1512 / 803], aspectRatioRounding: 'nearest'
} } };
const metadata: Metadata = { schemaVersion: '1.0', project: { id: 'demo', title: { en: 'Demo' }, creators: [{ name: 'Artist' }] } };
const request: RenderRequest = { width: 100, height: 100, format: 'image/png' };
const provider = createCapabilities(capabilities, { evaluate: async (_, { signal }) => ({ supported: !signal.aborted }) });
provider.validateRequest(request);
await provider.evaluateRequest?.(request, { timeout: 100 });
createMetadata(metadata).getProvenanceReferences();
getCapabilities(capabilities);
resolveLocalizedText(metadata.project.title, 'en');
const discovery = createDiscovery({ schemaVersion: 'oriel-artwork/1.0', artwork: { id: 'demo', version: '1' }, metadata, capabilities });
parseDiscovery(discovery.getDiscovery());
registerDiscovery({ id: 'demo', version: '1', manifest: () => ({ queries: {} }), registerQuery: () => () => {} }, discovery);
// @ts-expect-error requests must specify a MIME format
const missingFormat: RenderRequest = { width: 100, height: 100 };
// @ts-expect-error references cannot assert verified identity
createMetadata({ ...metadata, provenance: [{ kind: 'identity', uri: 'did:example:artist', verified: true }] });
// @ts-expect-error print units are explicit
const invalidUnit: RenderRequest = { ...request, print: { width: 1, height: 1, unit: 'pixels', dpi: 300 } };
void missingFormat; void invalidUnit;
// @ts-expect-error rounding is a declared policy, not an arbitrary tolerance
capabilities.technical.rendering.aspectRatioRounding = 'anything';

const printSpecification: PrintSpecification = { paper: 'Fixture', printer: 'Fixture', colourProfile: 'Fixture',
  renderingIntent: 'relative-colorimetric', grain: 'Artist criterion', lineWeight: 'Artist criterion',
  media: { finish: 'matte', settings: { candidate: true } }, blackPointCompensation: false,
  iccProfile: { name: 'fixture.icc', sha256: 'a'.repeat(64) },
  borders: { unit: 'mm', top: 0, right: 0, bottom: 0, left: 0 },
  colourCriteria: [{ metric: 'fixture', maximum: 1, unit: 'fixture', method: 'fixture' }],
  extensions: { 'art.kepler.print.v1': { candidate: true } } };
const printRequest: PrintRequest = { ...request, print: { width: 1, height: 1, unit: 'in', dpi: 100 } };
const printWorkflow = createPrintWorkflow({ artwork: { id: 'demo', version: '1', seed: 'test' }, capabilities,
  capture: art => ({ recipe: { artworkId: art.id, artworkVersion: art.version, seed: art.seed }, frame: { aspectRatio: 1 } }),
  inspect: async (job, { signal }) => ({ grain: { passed: !signal.aborted }, lineWeight: { passed: true },
    colour: { status: 'not-assessed', notes: job.specification.colourProfile } }) });
const printJob = printWorkflow.captureJob({ id: 'proof-1', request: printRequest, specification: printSpecification });
printWorkflow.captureJob(JSON.stringify({ id: 'proof-json', request: printRequest, specification: printSpecification }));
const printReport = await printJob.screen();
const savedReport: PrintScreeningReport = { job: printReport.job, screening: printReport.screening };
void savedReport;
// @ts-expect-error screening reports no longer expose a print-approval field
printReport.printApproval;
// @ts-expect-error capture must finish synchronously before any export work
createPrintWorkflow({ artwork: { id: 'demo', version: '1' }, capabilities, capture: async () => ({ recipe: { artworkId: 'demo', artworkVersion: '1' }, frame: { aspectRatio: 1 } }) });
// @ts-expect-error physical dimensions and DPI are required for print jobs
printWorkflow.captureJob({ id: 'proof-2', request, specification: printSpecification });

// The renderer module is typed without pulling p5/Three.js into SDK dependencies.
import { createCanvasRenderer, createP5Renderer, createThreeRenderer, createRenderSession,
  type RenderSession, type RenderSnapshot } from '@oriel-art/artist-sdk/renderers';
type DrawingState = { seed: string; time: number };
const canvasRenderer: RenderSession<DrawingState> = createCanvasRenderer<DrawingState>({ draw(ctx, frame) {
  ctx.fillRect(0, 0, frame.width, frame.height); frame.state.time.toFixed(2);
} });
const capturedFrame: RenderSnapshot<DrawingState> = await canvasRenderer.render({ width: 64, height: 64, state: { seed: 'sample', time: 0 } });
await canvasRenderer.exportPNG({ snapshot: capturedFrame, width: 128, height: 128 });
// @ts-expect-error snapshot state must match the artist-defined contract
canvasRenderer.render({ width: 64, height: 64, state: { seed: 'sample', time: 'later' } });
// @ts-expect-error renderer state is JSON, not arbitrary instances
createCanvasRenderer<{ date: Date }>({ draw() {} });
declare class P5Fixture {
  constructor(sketch: (p: P5Fixture) => void, node: HTMLElement);
  circle(x: number, y: number, diameter: number): void;
}
createP5Renderer({ p5: P5Fixture, draw(p, frame) { p.circle(frame.width / 2, 0, 10); } });
declare class ThreeRendererFixture { setClearColor(colour: string): void }
createThreeRenderer({ THREE: { WebGLRenderer: ThreeRendererFixture }, createScene({ renderer }) {
  renderer.setClearColor('black');
  return { scene: {}, camera: {}, update(frame) { frame.width.toFixed(); }, dispose() {} };
} });
createRenderSession({ createTarget({ document }) {
  return { canvas: document.createElement('canvas'), draw() {}, dispose() {} };
} });
canvasRenderer.dispose();
