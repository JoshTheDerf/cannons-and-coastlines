import * as THREE from 'three';

const GRID_SIZE = 512; // mm, full extent

const vert = /* glsl */ `
varying vec2 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vWorld;

// Anti-aliased grid line strength at the given spacing.
float gridStrength(vec2 p, float spacing) {
  vec2 coord = p / spacing;
  vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(min(grid.x, grid.y), 1.0);
}

float axisStrength(float c) {
  return 1.0 - min(abs(c) / fwidth(c), 1.0);
}

void main() {
  vec2 p = vWorld;

  // How big is one screen pixel in mm at this fragment?
  float pixelSizeMm = max(fwidth(p.x), fwidth(p.y));

  float major = gridStrength(p, 10.0);
  float minor = gridStrength(p, 1.0)  * smoothstep(0.10, 0.03, pixelSizeMm);
  float sub   = gridStrength(p, 0.1)  * smoothstep(0.010, 0.003, pixelSizeMm);

  float axX = axisStrength(p.y); // line where y = 0 → X axis
  float axY = axisStrength(p.x); // line where x = 0 → Y axis

  vec3 colSub   = vec3(0.16, 0.19, 0.22);
  vec3 colMinor = vec3(0.23, 0.29, 0.35);
  vec3 colMajor = vec3(0.42, 0.54, 0.65);
  vec3 colAxisX = vec3(0.90, 0.34, 0.34);
  vec3 colAxisY = vec3(0.35, 0.82, 0.45);

  vec3 color = vec3(0.0);
  float a = 0.0;

  color = mix(color, colSub,   sub);   a = max(a, sub   * 0.35);
  color = mix(color, colMinor, minor); a = max(a, minor * 0.55);
  color = mix(color, colMajor, major); a = max(a, major * 0.85);
  color = mix(color, colAxisX, axX);   a = max(a, axX);
  color = mix(color, colAxisY, axY);   a = max(a, axY);

  if (a < 0.01) discard;
  gl_FragColor = vec4(color, a);
}
`;

export function buildGrid(): THREE.Object3D {
  const geom = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    extensions: { derivatives: true } as any,
  });
  const plane = new THREE.Mesh(geom, mat);
  plane.name = 'grid';
  plane.renderOrder = -1;
  return plane;
}
