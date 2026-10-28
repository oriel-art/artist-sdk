/** Finite JSON data only. Signed zero is normalized for persistence. */
export type RenderJSON = null | boolean | number | string | RenderJSON[] | { [key: string]: RenderJSON };
export type RenderState = { [key: string]: RenderJSON };
export interface RenderSnapshot<State extends RenderState = RenderState> {
  width: number;
  height: number;
  state: State;
}
export interface RenderOptions<State extends RenderState = RenderState> extends RenderSnapshot<State> { signal?: AbortSignal }
export interface ExportOptions<State extends RenderState = RenderState> {
  /** Omit to export the last completed preview. Explicit snapshots need no preview. */
  snapshot?: RenderSnapshot<State>;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}
export interface RenderSession<State extends RenderState = RenderState> {
  readonly canvas: HTMLCanvasElement | null;
  render(options: RenderOptions<State>): Promise<RenderSnapshot<State>>;
  getSnapshot(): RenderSnapshot<State> | null;
  exportPNG(options?: ExportOptions<State>): Promise<Blob>;
  /** Idempotent. In-flight callbacks retain their resources until settlement. */
  dispose(): void;
}
export interface RendererOptions {
  container?: HTMLElement;
  document?: Document;
  /** Backing pixels, not CSS pixels. Default 16,777,216. */
  maxPixels?: number;
  /** Maximum width or height in pixels. Default 8,192. */
  maxDimension?: number;
}
export interface TargetContext {
  document: Document;
  purpose: 'preview' | 'export';
  /** Validated initial backing-pixel dimensions for this target. */
  width: number;
  height: number;
  signal?: AbortSignal;
}
export interface RenderTarget<State extends RenderState = RenderState> {
  canvas: HTMLCanvasElement;
  element?: HTMLElement;
  draw(snapshot: RenderSnapshot<State>, context: { signal?: AbortSignal }): void | Promise<void>;
  check?(): void;
  dispose(): void;
}
export function createRenderSession<State extends RenderState = RenderState>(options: RendererOptions & {
  /** Return a new owned target each time. Never return a live/shared canvas for an export. */
  createTarget(context: TargetContext): RenderTarget<State> | Promise<RenderTarget<State>>;
}): RenderSession<State>;
export function createCanvasRenderer<State extends RenderState = RenderState>(options: RendererOptions & {
  /** Draw synchronously from this snapshot; reset any artist-owned random state explicitly. */
  draw(context: CanvasRenderingContext2D, snapshot: RenderSnapshot<State>): void;
}): RenderSession<State>;
export function createP5Renderer<P, State extends RenderState = RenderState>(options: RendererOptions & {
  /** Supply the artist's pinned p5 constructor. The SDK does not import p5. */
  p5: new (sketch: (instance: P) => void, node: HTMLElement) => P;
  mode?: '2d' | 'webgl';
  /** Required context version in WEBGL mode; defaults to 2. No silent fallback. */
  webglVersion?: 1 | 2;
  /** Synchronous, once per fresh target at its requested dimensions. Later resizes do not rerun setup. Load assets before creating the session. */
  setup?(instance: P): void;
  /** Synchronous draw. Use snapshot state instead of frameCount/millis for replay. */
  draw(instance: P, snapshot: RenderSnapshot<State>): void;
}): RenderSession<State>;
export function createThreeRenderer<Renderer, State extends RenderState = RenderState>(options: RendererOptions & {
  THREE: { WebGLRenderer: new (...args: any[]) => Renderer };
  createScene(context: { renderer: Renderer; purpose: 'preview' | 'export'; signal?: AbortSignal }): {
    scene: object;
    camera: object;
    /** Set projection/aspect and all time-dependent state explicitly. Synchronous. */
    update(snapshot: RenderSnapshot<State>): void;
    /** Release artist-owned geometries, materials, textures and other resources. */
    dispose(): void;
  } | Promise<{
    scene: object;
    camera: object;
    update(snapshot: RenderSnapshot<State>): void;
    dispose(): void;
  }>;
}): RenderSession<State>;
