export const fragment = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_seed;
uniform float u_density;
uniform vec3 u_ink;
uniform vec3 u_paper;

void main() {
  // A fixed logical square, fitted to the short dimension of the output.
  vec2 p = (gl_FragCoord.xy - .5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  p *= 3.4;
  float phase = u_seed.x * 6.28318;
  float bend = sin(p.y * 1.7 + phase) * .35 + cos(p.x * 1.2 - phase) * .2;
  float field = length(p + vec2(bend, .12 * sin(u_time * .15)))
    + .22 * sin(p.x * 2.4 + p.y * 1.3 + phase)
    + .10 * cos(p.y * 4.0 - p.x * 1.6 + u_seed.y * 8.0);
  float bands = abs(fract(field * u_density * .35 - u_time * .025) - .5);
  float line = 1.0 - smoothstep(.035, .065, bands);
  float wash = smoothstep(-1.5, 1.5, p.x + p.y * .3);
  vec3 background = mix(u_paper, u_ink, .10 + .17 * wash);
  vec3 color = mix(background, u_ink, line * .88);
  gl_FragColor = vec4(color, 1.0);
}`;
