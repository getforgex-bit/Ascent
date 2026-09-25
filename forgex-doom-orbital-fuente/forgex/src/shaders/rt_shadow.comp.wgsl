// FORGEX DOOM Orbital — rt_shadow.comp.wgsl (Agente B)
// Trazado de rayos de sombra por píxel en 4 modos (0: off, 1: 4 luces, 2: todas, 3: soft shadows con jitter).

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(1) @binding(0) var<storage, read> blocks: array<GpuBlock>;
@group(1) @binding(1) var<storage, read> cell_head: array<u32>;
@group(1) @binding(2) var<storage, read> cz: array<vec2<f32>>;
@group(1) @binding(3) var<storage, read> chunk_state: array<u32>;

@group(2) @binding(0) var atlas_tex: texture_2d<u32>;
@group(2) @binding(1) var<storage, read> sprites: array<SpriteInstance>;

@group(3) @binding(0) var<storage, read> lights: array<Light>;
@group(3) @binding(1) var<storage, read> shadows: array<Shadow>;
@group(3) @binding(2) var<storage, read_write> gbuf: array<u32>;
@group(3) @binding(3) var<storage, read_write> light_buf: array<vec4<f32>>;
@group(3) @binding(4) var<storage, read_write> bloom_buf: array<u32>;

const LSOFT: f32 = 0.34;

fn get_ray_origin(nrm: u32, q: vec3<f32>, l: vec3<f32>) -> vec3<f32> {
  switch (nrm) {
    case 0u: { return vec3<f32>(q.x, q.y, q.z + 0.03); }
    case 1u: { return vec3<f32>(q.x, q.y, q.z - 0.03); }
    case 2u: { return vec3<f32>(q.x + 0.03, q.y, q.z); }
    case 3u: { return vec3<f32>(q.x - 0.03, q.y, q.z); }
    case 4u: { return vec3<f32>(q.x, q.y + 0.03, q.z); }
    case 5u: { return vec3<f32>(q.x, q.y - 0.03, q.z); }
    default: {
      let delta = l - q;
      let inv = 0.15 / sqrt(dot(delta, delta) + 1e-4);
      return q + delta * inv;
    }
  }
}

fn is_occluded(p0: vec3<f32>, p1: vec3<f32>) -> bool {
  let delta = p1 - p0;
  let dx = delta.x;
  let dy = delta.y;
  let dz = delta.z;
  var cx = i32(floor(p0.x));
  var cy = i32(floor(p0.y));
  let stx = select(-1, 1, dx > 0.0);
  let sty = select(-1, 1, dy > 0.0);
  let tdx = select(abs(1.0 / dx), 1e30, dx == 0.0);
  let tdy = select(abs(1.0 / dy), 1e30, dy == 0.0);
  var tmx = select(select((p0.x - f32(cx)) * tdx, (f32(cx) + 1.0 - p0.x) * tdx, dx > 0.0), 1e30, dx == 0.0);
  var tmy = select(select((p0.y - f32(cy)) * tdy, (f32(cy) + 1.0 - p0.y) * tdy, dy > 0.0), 1e30, dy == 0.0);
  var t0 = 0.0;
  for (var step = 0; step < 96; step++) {
    let t1 = min(min(tmx, tmy), 1.0);
    if (cx >= 0 && cy >= 0 && u32(cx) < MW && u32(cy) < MH) {
      let ci = u32(cy) * MW + u32(cx);
      var bi = cell_head[ci];
      if (bi != 0u) {
        let za = p0.z + dz * t0;
        let zb = p0.z + dz * t1;
        let lo = min(za, zb);
        let hi = max(za, zb);
        while (bi != 0u) {
          let b = blocks[bi - 1u];
          if (b.zb < hi && b.zt > lo) {
            return true;
          }
          bi = b.next;
        }
      }
    }
    if (t1 >= 1.0) { break; }
    t0 = t1;
    if (tmx < tmy) {
      cx += stx;
      tmx += tdx;
    } else {
      cy += sty;
      tmy += tdy;
    }
  }
  return false;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.res.x || gid.y >= u.res.y) {
    return;
  }
  let px_idx = gid.y * u.res.x + gid.x;
  let out_base = px_idx * 4u;

  let px_meta = gbuf[out_base + 2u];
  let nrm = px_meta & 0xffu;
  let glow = gbuf[out_base + 3u];

  if (nrm == SKYN || glow != 0u) {
    light_buf[px_idx] = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    return;
  }

  let d = bitcast<f32>(gbuf[out_base + 1u]);
  let past_dist = (d >= u.rt_max);

  let proj = f32(u.res.x) / (2.0 * u.pl);
  let inv_proj = 1.0 / proj;
  let v = (f32(u.res.y) * 0.5 - f32(gid.y) - 0.5) * inv_proj;
  let row = u.cam_up * v;
  let cx = (2.0 * (f32(gid.x) + 0.5) / f32(u.res.x) - 1.0) * u.pl;
  let col = u.cam_dir + u.cam_right * cx;
  let ray = col + row;

  let qx = u.cam_pos.x + ray.x * d;
  let qy = u.cam_pos.y + ray.y * d;
  let qz = u.cam_pos.z + ray.z * d;
  let qpos = vec3<f32>(qx, qy, qz);

  let nx = select(0.0, select(-1.0, 1.0, nrm == 2u), nrm == 2u || nrm == 3u);
  let ny = select(0.0, select(-1.0, 1.0, nrm == 4u), nrm == 4u || nrm == 5u);
  let nz = select(0.0, select(-1.0, 1.0, nrm == 0u), nrm == 0u || nrm == 1u);
  let is_spr = (nrm >= 6u);

  // Leer iluminación base actual (ambiente + linterna)
  var lit = light_buf[px_idx];
  var cr = lit.r;
  var cg = lit.g;
  var cb = lit.b;

  var total_vis = 0.0;
  var lit_count = 0.0;

  // Jitter offsets para Modo 3
  let jit = array<vec3<f32>, 4>(
    vec3<f32>(0.72, 0.72, 0.3),
    vec3<f32>(-0.72, 0.72, -0.3),
    vec3<f32>(0.72, -0.72, -0.3),
    vec3<f32>(-0.72, -0.72, 0.3)
  );

  for (var li = 0u; li < u.n_lights; li++) {
    let lt = lights[li];
    let lx = lt.p0.x;
    let ly = lt.p0.y;
    let lz = lt.p0.z;
    let lr = lt.p0.w;
    let lg = lt.p1.x;
    let lb = lt.p1.y;
    let l_rad = lt.p1.z;
    let l_int = lt.p1.w;

    if (l_int <= 0.0 || l_rad <= 0.0) {
      continue;
    }
    let r2 = l_rad * l_rad;
    let dx = lx - qx;
    let dy = ly - qy;
    let dz = lz - qz;
    let d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) {
      continue;
    }
    let comp = dx * nx + dy * ny + dz * nz;
    if (!is_spr && comp <= 0.0) {
      continue;
    }
    var f = 1.0 - d2 / r2;
    f = f * f;
    let lam = 0.3 + (0.7 * comp) / sqrt(d2 + 1e-4);
    if (!is_spr) {
      f *= lam;
    }

    // Comprobar trazado de rayos según modo y distancia
    var vis = 1.0;
    let trace = !past_dist && ((u.rt_mode >= 2u) || (u.rt_mode == 1u && li < 4u));
    if (trace && (f * l_int > 0.03)) {
      let lpos = vec3<f32>(lx, ly, lz);
      if (u.rt_mode == 3u) {
        // Modo 3: 4 rayos con jitter esférico
        var unocc = 0.0;
        for (var q = 0u; q < 4u; q++) {
          let tgt = lpos + jit[q] * LSOFT;
          let o = get_ray_origin(nrm, qpos, tgt);
          if (!is_occluded(o, tgt)) {
            unocc += 1.0;
          }
        }
        vis = 0.06 + 0.94 * (unocc / 4.0);
      } else {
        // Modos 1 y 2: 1 rayo directo
        let o = get_ray_origin(nrm, qpos, lpos);
        if (is_occluded(o, lpos)) {
          vis = 0.06;
        } else {
          vis = 1.0;
        }
      }
    }

    f *= vis;
    cr += f * lr * l_int;
    cg += f * lg * l_int;
    cb += f * lb * l_int;

    total_vis += vis;
    lit_count += 1.0;
  }

  let final_vis = select(total_vis / max(lit_count, 1.0), 1.0, past_dist || lit_count == 0.0);
  light_buf[px_idx] = vec4<f32>(cr, cg, cb, final_vis);
}
