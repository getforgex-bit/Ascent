// FORGEX DOOM Orbital — compose.frag.wgsl (Agente B)
// Composición final: cielo, color base modulado por luz diferida/sombras RT, bloom (0.9), vignette y gamma.

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(2) @binding(0) var atlas_tex: texture_2d<u32>;
@group(3) @binding(0) var<storage, read> lights: array<Light>;
@group(3) @binding(1) var<storage, read> shadows: array<Shadow>;
@group(3) @binding(2) var<storage, read> gbuf: array<u32>;
@group(3) @binding(3) var<storage, read> light_buf: array<vec4<f32>>;
@group(3) @binding(4) var<storage, read> bloom_buf: array<u32>;

fn unpack_bloom(c: u32) -> vec3<f32> {
  return vec3<f32>(
    f32(c & 255u),
    f32((c >> 8u) & 255u),
    f32((c >> 16u) & 255u)
  ) / 255.0;
}

fn sample_bloom_bilinear(x: u32, y: u32) -> vec3<f32> {
  let bw = f32(u.res.x / 4u);
  let bh = f32(u.res.y / 4u);
  if (bw <= 0.0 || bh <= 0.0) {
    return vec3<f32>(0.0);
  }
  let u_coord = (f32(x) + 0.5) / 4.0 - 0.5;
  let v_coord = (f32(y) + 0.5) / 4.0 - 0.5;
  let x0 = clamp(i32(floor(u_coord)), 0, i32(bw) - 1);
  let x1 = clamp(x0 + 1, 0, i32(bw) - 1);
  let y0 = clamp(i32(floor(v_coord)), 0, i32(bh) - 1);
  let y1 = clamp(y0 + 1, 0, i32(bh) - 1);
  let fx = u_coord - floor(u_coord);
  let fy = v_coord - floor(v_coord);
  let c00 = unpack_bloom(bloom_buf[u32(y0) * u32(bw) + u32(x0)]);
  let c10 = unpack_bloom(bloom_buf[u32(y0) * u32(bw) + u32(x1)]);
  let c01 = unpack_bloom(bloom_buf[u32(y1) * u32(bw) + u32(x0)]);
  let c11 = unpack_bloom(bloom_buf[u32(y1) * u32(bw) + u32(x1)]);
  return mix(mix(c00, c10, fx), mix(c01, c11, fx), fy);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let x = clamp(u32(in.pos.x), 0u, u.res.x - 1u);
  let y = clamp(u32(in.pos.y), 0u, u.res.y - 1u);
  let px_idx = y * u.res.x + x;
  let out_base = px_idx * 4u;

  let c_raw = gbuf[out_base];
  let base_col = vec3<f32>(
    f32(c_raw & 255u),
    f32((c_raw >> 8u) & 255u),
    f32((c_raw >> 16u) & 255u)
  ) / 255.0;

  let px_meta = gbuf[out_base + 2u];
  let nrm = px_meta & 0xffu;
  let glow_raw = gbuf[out_base + 3u];

  var out_col = vec3<f32>(0.0);
  if (nrm == SKYN || glow_raw != 0u) {
    out_col = base_col;
  } else {
    let l = light_buf[px_idx].rgb;
    out_col = base_col * min(l, vec3<f32>(1.8));
  }

  // Suma bloom con factor 0.9 (equivalente a la ruta CPU)
  if (u.bloom_enabled != 0u) {
    let bloom = sample_bloom_bilinear(x, y);
    out_col += bloom * 0.9;
  }

  // Vignette desde uniforms si vignette_strength > 0
  if (u.vignette_strength > 0.0) {
    let uv = (vec2<f32>(f32(x) + 0.5, f32(y) + 0.5) / vec2<f32>(f32(u.res.x), f32(u.res.y))) - vec2<f32>(0.5, 0.5);
    let dist = length(uv);
    let vig = clamp((dist - 0.25) / 0.5, 0.0, 1.0);
    out_col *= (1.0 - vig * (u.vignette_strength * 0.6));
  }

  // Gamma desde uniforms
  if (u.gamma > 0.0 && abs(u.gamma - 1.0) > 0.01) {
    out_col = pow(clamp(out_col, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / u.gamma));
  }

  return vec4<f32>(clamp(out_col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
