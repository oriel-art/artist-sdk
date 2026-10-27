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
