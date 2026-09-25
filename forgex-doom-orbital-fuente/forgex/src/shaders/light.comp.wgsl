// FORGEX DOOM Orbital — light.comp.wgsl (Agente B)
// Iluminación diferida: ambiente, linterna, sombras de contacto y luces puntuales (Lambert).

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
  let amb_u8 = (px_meta >> 8u) & 0xffu;
  let a = f32(amb_u8) / 255.0;

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

  var cr = a * 0.9;
  var cg = a * 0.95;
  var cb = a * 1.1;

  let cone_cx = f32(u.res.x) * 0.5;
  let cone_cy = f32(u.res.y) * 0.52;
  let cone_k = 2.0 / f32(u.res.x);
  let vcx = (f32(gid.x) - cone_cx) * cone_k;
  let vcy = (f32(gid.y) - cone_cy) * cone_k;
  let rr = vcx * vcx + vcy * vcy;
  if (u.lamp != 0u && rr < (0.66 * 0.66)) {
    let r = sqrt(rr);
    let c = clamp(1.0 - (r - 0.16) * 2.0, 0.0, 1.0);
    let cf = c * c;
    let f = (cf * 1.1) / (1.0 + d * d * 0.025);
    cr += f;
    cg += f * 0.93;
    cb += f * 0.8;
  }

  let nx = select(0.0, select(-1.0, 1.0, nrm == 2u), nrm == 2u || nrm == 3u);
  let ny = select(0.0, select(-1.0, 1.0, nrm == 4u), nrm == 4u || nrm == 5u);
  let nz = select(0.0, select(-1.0, 1.0, nrm == 0u), nrm == 0u || nrm == 1u);
  let is_spr = (nrm >= 6u);

  if (nrm == 0u) {
    for (var s = 0u; s < u.n_shadows; s++) {
      let sh = shadows[s];
      let sx = sh.p0.x;
      let sy = sh.p0.y;
      let sz = sh.p0.z;
      let s_rad = sh.p0.w;
      let kk = sh.p1.x;
      if (s_rad > 0.0 && abs(qz - sz) <= 0.08) {
        let dx = qx - sx;
        let dy = qy - sy;
        let d2 = dx * dx + dy * dy;
        let r2 = s_rad * s_rad;
        if (d2 < r2) {
          let m = 1.0 - kk * (1.0 - d2 / r2);
          cr *= m;
          cg *= m;
          cb *= m;
        }
      }
    }
  }

  if (u.rt_mode == 0u) {
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
      cr += f * lr * l_int;
      cg += f * lg * l_int;
      cb += f * lb * l_int;
    }
  }

  light_buf[px_idx] = vec4<f32>(cr, cg, cb, 1.0);
}
