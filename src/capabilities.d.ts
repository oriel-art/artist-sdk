export const CAPABILITIES_VERSION: '1.0';
export interface Range { min: number; max: number }
export interface RenderingLimits {
  width: Range;
  height: Range;
  maxPixels: number;
  /** MIME types, e.g. image/png. */
  formats: string[];
  /** width / height. Omitted means unrestricted. */
  aspectRatios?: number[];
  /** Default nearest: height = round(width / ratio) OR width = round(height * ratio).
   * Strict preserves the legacy relative tolerance of 1e-6.
   * Requires aspectRatios in this same technical or artist constraint. */
  aspectRatioRounding?: 'nearest' | 'strict';
}
export interface PrintLimits {
  /** Physical dimensions in inches. */
  width: Range;
  height: Range;
  dpi: Range;
  tiling?: boolean;
}
export interface InteractionSupport { pointer?: boolean; keyboard?: boolean; touch?: boolean }
export interface AnimationSupport { supported?: boolean; seek?: boolean; pause?: boolean }
export interface StateSupport {
  /** Capture the inputs/context required by the artist's documented replay contract. */
  save?: boolean;
  /** Restore that state in the current mode; does not assert cross-device pixel identity. */
  restore?: boolean;
  /** Legacy boolean without a portable environment/fidelity contract. Omit when
   * claiming only state replay; consumers must not infer pixel identity from it. */
  deterministic?: boolean;
}
export interface Capabilities {
  schemaVersion: '1.0';
  technical: {
    rendering: RenderingLimits;
    print?: PrintLimits;
    interaction?: InteractionSupport;
    animation?: AnimationSupport;
    state?: StateSupport;
  };
  artist?: { rendering?: Partial<RenderingLimits>; print?: Partial<PrintLimits>; notes?: string };
  evaluation?: 'optional' | 'required';
}
export interface RenderRequest {
  /** Final output pixels, including the full image for tiled requests. */
  width: number;
  height: number;
  format: string;
  print?: { width: number; height: number; unit: 'in' | 'cm' | 'mm'; dpi: number; tiled?: boolean };
  interaction?: InteractionSupport;
  animation?: AnimationSupport;
  state?: StateSupport;
}
export interface ValidationIssue {
  source: 'request' | 'technical' | 'artist' | 'runtime';
  code: string;
  path: string;
  message: string;
}
export interface ValidationResult {
  status: 'supported' | 'unsupported' | 'requires-evaluation';
  issues: ValidationIssue[];
}
export interface EvaluationOptions {
  signal?: AbortSignal;
  /** Milliseconds, default 5000, maximum 60000. Late results reject with TIMEOUT. */
  timeout?: number;
}
export type RequestEvaluator = (request: RenderRequest, context: { capabilities: Capabilities; signal: AbortSignal }) =>
  { supported: boolean; reasons?: string[] } | Promise<{ supported: boolean; reasons?: string[] }>;
export interface CapabilitiesProvider {
  getCapabilities(): Capabilities;
  validateRequest(request: unknown): ValidationResult;
  /** At most four active hooks per evaluator function; excess calls reject with BUSY.
   * Timed-out or cancelled hooks retain capacity until their work settles. */
  evaluateRequest?(request: RenderRequest, options?: EvaluationOptions): Promise<ValidationResult>;
}
export function getCapabilities(description: unknown): Capabilities;
export function validateRequest(description: Capabilities, request: unknown): ValidationResult;
export function evaluateRequest(description: Capabilities, request: RenderRequest, evaluator?: RequestEvaluator, options?: EvaluationOptions): Promise<ValidationResult>;
export function createCapabilities(description: Capabilities, options?: { evaluate?: RequestEvaluator }): CapabilitiesProvider;

export const PRINT_JOB_VERSION: 'oriel-print-job/1.0';
/** Finite JSON data; signed zero is normalized to positive zero before screening/persistence. */
export type PrintJSON = null | boolean | number | string | PrintJSON[] | { [key: string]: PrintJSON };
export interface PrintArtwork { readonly id: string; readonly version: string }
export interface PrintSpecification {
  paper: string;
  printer: string;
  /** Artist/printer-selected profile identifier. The SDK does not apply ICC transforms. */
  colourProfile: string;
  renderingIntent: 'perceptual' | 'relative-colorimetric' | 'absolute-colorimetric' | 'saturation';
  /** Artist-owned acceptance criteria, including units where relevant. */
  grain: string;
  lineWeight: string;
  notes?: string;
  media?: { manufacturer?: string; stock?: string; finish?: string; weightGsm?: number;
    inkSet?: string; settings?: { [key: string]: PrintJSON } };
  /** SHA-256 of the actual ICC file bytes, lowercase hex; descriptive, not verified by the SDK. */
  iccProfile?: { name: string; sha256: string };
  blackPointCompensation?: boolean;
  /** Borders outside the image area. request.print dimensions always describe the image. */
  borders?: { unit: 'in' | 'cm' | 'mm'; top: number; right: number; bottom: number; left: number };
  /** Artist/printer-defined maximum criteria. Measurement remains the inspector's job. */
  colourCriteria?: { metric: string; maximum: number; unit: string; method: string }[];
  /** Use namespaced keys for integration-owned data; shares the 8 KiB specification budget. */
  extensions?: { [namespace: string]: PrintJSON };
}
export type PrintRequest = RenderRequest & { print: NonNullable<RenderRequest['print']> };
export interface PrintCapture {
  /** Replay data belongs to the artist's recipe contract; identity must match artwork. */
  recipe: { artworkId: string; artworkVersion: string; [key: string]: PrintJSON };
  /** Other keys carry artist-defined time/cadence/state. Ratios must match declared policy. */
  frame: { aspectRatio: number; [key: string]: PrintJSON };
  /** Plain JSON only; convert typed arrays to arrays in the capture callback. */
  uniforms?: { [key: string]: PrintJSON };
}
export interface PrintJobRecord {
  schemaVersion: typeof PRINT_JOB_VERSION;
  id: string;
  artwork: PrintArtwork;
  capabilities: Capabilities;
  request: PrintRequest;
  specification: PrintSpecification;
  capture: PrintCapture;
}
/** Legacy input: false means failed; use PrintAssessment for unassessed checks. */
export interface PrintCheck { passed: boolean; status?: never; notes?: string }
export interface PrintAssessment { status: 'passed' | 'failed' | 'not-assessed'; passed?: never; notes?: string }
export interface PrintChecks { grain: PrintCheck | PrintAssessment; lineWeight: PrintCheck | PrintAssessment; colour: PrintCheck | PrintAssessment }
/** Constraint rejection errors retain code/message and expose isolated validation issues. */
export interface PrintConstraintError extends Error { code: string; issues: ValidationIssue[] }
export type PrintInspector = (job: PrintJobRecord, context: { signal: AbortSignal }) => PrintChecks | Promise<PrintChecks>;
export interface PrintScreeningReport {
  job: PrintJobRecord;
  screening: ValidationResult;
  checks?: PrintChecks;
  /** Screening never records proof approval. Keep physical decisions outside the SDK. */
  printApproval: 'not-granted';
}
export interface PrintJob {
  getJob(): PrintJobRecord;
  validate(): ValidationResult;
  screen(options?: EvaluationOptions): Promise<PrintScreeningReport>;
}
export interface PrintWorkflow {
  getCapabilities(): Capabilities;
  /** Captures synchronously. External data: raw JSON text limited to 20 KiB before parsing;
   * also bound transport reads. Object inputs are for trusted in-process callers and do
   * not provide a hard bound on the engine's enumeration cost. Invalid requests throw. */
  captureJob(input: string | { id: string; request: PrintRequest; specification: PrintSpecification }): PrintJob;
}
export function createPrintWorkflow<Artwork extends PrintArtwork>(options: {
  artwork: Artwork;
  capabilities: Capabilities;
  /** Read-only, synchronous snapshot of recipe, frame and uniforms. Never render here. */
  capture: (artwork: Artwork, context: { request: PrintRequest; specification: PrintSpecification }) => PrintCapture;
  /** Reuse a stable function: at most four inspections across workflows in one module.
   * Timed-out/cancelled work retains capacity until it settles. */
  inspect?: PrintInspector;
}): PrintWorkflow;
