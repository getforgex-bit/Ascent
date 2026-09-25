// FORGEX DOOM Orbital — Definiciones comunes WGSL (Agente B)
struct GpuBlock {
  next: u32,       // índice 1-based del siguiente bloque en la celda (0 = fin de lista)
  tex_flags: u32,  // tex:8 | flags:8 | ao:8 | pad:8
  zb: f32,
  zt: f32,
  gx: f32,
  gy: f32,
  gw: f32,
  gh: f32,
};

struct SpriteInstance {
  atlas_off: u32,
  side: u32,
  x0: f32,
  x1: f32,
  y0: f32,
  y1: f32,
  depth: f32,
  light: f32,
};

struct Hit {
  bb: u32,
  kind: u32,
  side: i32,
  t: f32,
  p: f32,
};

struct Uniforms {
  cam_pos: vec3<f32>, _pad0: f32,
  cam_dir: vec3<f32>, _pad1: f32,
  cam_right: vec3<f32>, _pad2: f32,
  cam_up: vec3<f32>, _pad3: f32,
  res: vec2<u32>, rt_mode: u32, rt_max: f32,
  n_lights: u32, n_shadows: u32, lamp: u32, acid: u32,
  maxd: f32, pl: f32, n_sprites: u32, _pad4: f32,
  bloom_enabled: u32, vignette_strength: f32, gamma: f32, _pad5: f32,
};

struct Light {
  p0: vec4<f32>, // x, y, z, r
  p1: vec4<f32>, // g, b, rad, intensity
};

struct Shadow {
  p0: vec4<f32>, // x, y, z, rad
  p1: vec4<f32>, // str, _pad, _pad, _pad
};

const SKYN: u32 = 7u;
const EMPTY: u32 = 255u;
const MW: u32 = 532u;
const MH: u32 = 532u;
const T: f32 = 128.0;
const TM: i32 = 127;
const TAU: f32 = 6.2831855;
const PI: f32 = 3.14159265;
const HALF_PI: f32 = 1.5707963;
const BLACK: u32 = 0xff000000u;
const DARK: u32 = 0xff120810u;
const PADG: u32 = 0xff5f5a14u;
const AMB_IN: f32 = 0.3;
const AMB_OUT: f32 = 0.95;
const F_RIM: u32 = 1u;
const F_SHIP: u32 = 2u;
const F_PAD: u32 = 4u;
const F_ACID: u32 = 8u;

fn lvlf(d: f32) -> u32 {
  return clamp(u32(d * (1.0 / 2.4)), 0u, 15u);
}

fn ao_floor(ao: u32, wx: f32, wy: f32) -> f32 {
  let fx = wx - floor(wx);
  let fy = wy - floor(wy);
  var m = 1.0;
  if ((ao & 1u) != 0u) { m = min(m, fx * 2.5); }
  if ((ao & 2u) != 0u) { m = min(m, (1.0 - fx) * 2.5); }
  if ((ao & 4u) != 0u) { m = min(m, fy * 2.5); }
  if ((ao & 8u) != 0u) { m = min(m, (1.0 - fy) * 2.5); }
  if (m < 1.0) { return 0.38 + 0.62 * m; } else { return 1.0; }
}

fn pack_color(r: f32, g: f32, b: f32) -> u32 {
  let cr = clamp(u32(r), 0u, 255u);
  let cg = clamp(u32(g), 0u, 255u);
  let cb = clamp(u32(b), 0u, 255u);
  return 0xff000000u | (cb << 16u) | (cg << 8u) | cr;
}
