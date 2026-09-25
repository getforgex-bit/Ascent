// FORGEX DOOM Orbital — raycast.comp.wgsl (Agente B)
// Raymarch 3D DDA celda a celda equivalente a trace3d de CPU.

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

fn sample_sky(dx: f32, dy: f32, dz: f32) -> u32 {
  let rxy = length(vec2<f32>(dx, dy));
  var u_norm = atan2(dy, dx) / TAU;
  u_norm = u_norm - floor(u_norm);
  let v_norm = clamp(0.5 - atan2(dz, max(rxy, 1e-9)) / PI, 0.0, 1.0);
  let sx = clamp(i32(u_norm * 1536.0), 0, 1535);
  let sy = clamp(i32(v_norm * 768.0), 0, 767);
  let t = textureLoad(atlas_tex, vec2<i32>(sx, sy), 0);
  return t.r | (t.g << 8u) | (t.b << 16u) | 0xff000000u;
}

fn sample_texlv(tex: u32, lvl: u32, tx: i32, ty: i32) -> u32 {
  let tile_idx = tex * 16u + lvl;
  let tile_col = tile_idx % 16u;
  let tile_row = tile_idx / 16u;
  let ax = i32(tile_col * 128u) + tx;
  let ay = 2048 + i32(tile_row * 128u) + ty;
  let t = textureLoad(atlas_tex, vec2<i32>(ax, ay), 0);
  return t.r | (t.g << 8u) | (t.b << 16u) | 0xff000000u;
}

fn sample_texgl(tex: u32, tx: i32, ty: i32) -> u32 {
  let ax = i32(tex * 128u) + tx;
  let ay = 3072 + ty;
  let t = textureLoad(atlas_tex, vec2<i32>(ax, ay), 0);
  if (t.a == 0u) { return 0u; }
  return t.r | (t.g << 8u) | (t.b << 16u) | 0xff000000u;
}

fn sample_rim(tex: u32, lvl: u32) -> u32 {
  let ax = i32(tex * 16u + lvl);
  let t = textureLoad(atlas_tex, vec2<i32>(ax, 3200), 0);
  return t.r | (t.g << 8u) | (t.b << 16u) | 0xff000000u;
}

fn sample_rimg(tex: u32, lvl: u32) -> u32 {
  let ax = i32(tex * 16u + lvl);
  let t = textureLoad(atlas_tex, vec2<i32>(ax, 3201), 0);
  if (t.a == 0u && t.r == 0u && t.g == 0u && t.b == 0u) { return 0u; }
  return t.r | (t.g << 8u) | (t.b << 16u) | 0xff000000u;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.res.x || gid.y >= u.res.y) {
    return;
  }
  let x = gid.x;
  let y = gid.y;
  let px_idx = y * u.res.x + x;

  let proj = f32(u.res.x) / (2.0 * u.pl);
  let inv_proj = 1.0 / proj;
  let v = (f32(u.res.y) * 0.5 - f32(y) - 0.5) * inv_proj;
  let row = u.cam_up * v;
  let cx = (2.0 * (f32(x) + 0.5) / f32(u.res.x) - 1.0) * u.pl;
  let ray_col = u.cam_dir + u.cam_right * cx;
  let ray = ray_col + row;
  let dx = ray.x;
  let dy = ray.y;
  let dz = ray.z;

  let ddx = select(min(abs(1.0 / dx), 1e30), 1e30, dx == 0.0);
  let ddy = select(min(abs(1.0 / dy), 1e30), 1e30, dy == 0.0);
  let inv_dz = select(1.0 / dz, 0.0, dz == 0.0);

  let mx0 = i32(floor(u.cam_pos.x));
  let my0 = i32(floor(u.cam_pos.y));
  let fxl = u.cam_pos.x - f32(mx0);
  let fxh = f32(mx0) + 1.0 - u.cam_pos.x;
  let fyl = u.cam_pos.y - f32(my0);
  let fyh = f32(my0) + 1.0 - u.cam_pos.y;

  let stx = select(1, -1, dx < 0.0);
  let sty = select(1, -1, dy < 0.0);
  var sdx = select(fxh * ddx, fxl * ddx, dx < 0.0);
  var sdy = select(fyh * ddy, fyl * ddy, dy < 0.0);

  var mapx = mx0;
  var mapy = my0;
  var t0 = 0.0;
  var side = -1;

  var hit_bb = 0u;
  var hit_kind = 0u;
  var hit_side = -1;
  var hit_t = 0.0;

  for (var s = 0; s < 200; s++) {
    let t1 = min(sdx, sdy);
    if (mapx >= 0 && mapy >= 0 && u32(mapx) < MW && u32(mapy) < MH) {
      let ci = u32(mapy) * MW + u32(mapx);
      var bi = cell_head[ci];
      if (bi != 0u) {
        let za = u.cam_pos.z + dz * t0;
        let zb = u.cam_pos.z + dz * t1;
        let lo = min(za, zb);
        let hi = max(za, zb);
        let cell_cz = cz[ci];
        if (hi >= cell_cz.x && lo <= cell_cz.y) {
          var bt = 1e30;
          var bk = 0u;
          var bb = 0u;
          while (bi != 0u) {
            let b = blocks[bi - 1u];
            if (b.zb > hi) { break; }
            if (b.zt >= lo) {
              if (side >= 0 && za >= b.zb && za <= b.zt) {
                if (t0 < bt) { bt = t0; bk = 1u; bb = bi; }
              } else if (dz < 0.0 && za > b.zt && zb <= b.zt) {
                let t = (b.zt - u.cam_pos.z) * inv_dz;
                if (t < bt) { bt = t; bk = 2u; bb = bi; }
              } else if (dz > 0.0 && za < b.zb && zb >= b.zb) {
                let t = (b.zb - u.cam_pos.z) * inv_dz;
                if (t < bt) { bt = t; bk = 3u; bb = bi; }
              }
            }
            bi = b.next;
          }
          if (bk != 0u) {
            hit_bb = bb;
            hit_kind = bk;
            hit_side = side;
            hit_t = bt;
            break;
          }
        }
      }
    }
    if (t1 > u.maxd) { break; }
    let z1 = u.cam_pos.z + dz * t1;
    if ((dz > 0.0 && z1 > 100.0) || (dz < 0.0 && z1 < -100.0)) { break; }
    t0 = t1;
    if (sdx < sdy) {
      sdx += ddx;
      mapx += stx;
      side = 0;
    } else {
      sdy += ddy;
      mapy += sty;
      side = 1;
    }
  }

  let out_base = px_idx * 4u;
  if (hit_bb == 0u) {
    let sky_col = sample_sky(dx, dy, dz);
    gbuf[out_base] = sky_col;
    gbuf[out_base + 1u] = bitcast<u32>(1e9);
    gbuf[out_base + 2u] = SKYN;
    gbuf[out_base + 3u] = 0u;
    return;
  }

  let b = blocks[hit_bb - 1u];
  let hx = u.cam_pos.x + dx * hit_t;
  let hy = u.cam_pos.y + dy * hit_t;
  let hz = u.cam_pos.z + dz * hit_t;
  let d = max(hit_t, 0.02);

  let tex = b.tex_flags & 0xffu;
  let flags = (b.tex_flags >> 8u) & 0xffu;
  let b_ao = (b.tex_flags >> 16u) & 0xffu;
  let a0 = select(AMB_OUT, AMB_IN, (flags & F_SHIP) != 0u);

  var col = BLACK;
  var glow = 0u;
  var nrm = 0u;
  var a = a0;

  if (hit_kind == 1u) {
    let u_coord = select(hx, hy, hit_side == 0);
    let tx = clamp(i32((u_coord - floor(u_coord)) * 128.0), 0, 127);
    let l0 = lvlf(d);
    let li = clamp(l0 + 1u + u32(hit_side) * 2u, 0u, 15u);
    nrm = select(select(4u, 5u, dy > 0.0), select(2u, 3u, dx > 0.0), hit_side == 0);
    let th = b.zt - b.zb;
    let zz = b.zt - hz;
    let rim = (flags & F_RIM) != 0u;
    if (rim && zz < 0.045) {
      col = sample_rim(tex, l0);
      glow = sample_rimg(tex, l0);
    } else if (rim && (th - zz) < 0.03) {
      col = DARK;
      glow = 0u;
    } else {
      if ((flags & F_SHIP) != 0u) {
        let up = th - zz;
        if (up < 0.45) { a *= 0.35 + 0.65 * up * (1.0 / 0.45); }
        if (zz < 0.3) { a *= 0.55 + 0.45 * zz * (1.0 / 0.3); }
      }
      let ty = i32(-hz * 128.0) & 127;
      col = sample_texlv(tex, li, tx, ty);
      glow = sample_texgl(tex, tx, ty);
    }
  } else if (hit_kind == 2u) {
    let l = lvlf(d);
    let rim = (flags & F_RIM) != 0u;
    if (rim && (hx - b.gx < 0.05 || (b.gx + b.gw) - hx < 0.05 || hy - b.gy < 0.05 || (b.gy + b.gh) - hy < 0.05)) {
      col = sample_rim(tex, l);
      glow = sample_rimg(tex, l);
    } else {
      let aoff = select(0, i32(u.acid), (flags & F_ACID) != 0u);
      let tx = (i32(floor(hx * 128.0)) + aoff) & 127;
      let ty = (i32(floor(hy * 128.0)) + (aoff >> 1)) & 127;
      if (b_ao != 0u) {
        a = a0 * ao_floor(b_ao, hx, hy);
      }
      col = sample_texlv(tex, l, tx, ty);
      glow = sample_texgl(tex, tx, ty);
      if (glow == 0u && (flags & F_PAD) != 0u) {
        glow = PADG;
      }
    }
    nrm = 0u;
  } else {
    let tx = i32(floor(hx * 128.0)) & 127;
    let ty = i32(floor(hy * 128.0)) & 127;
    if ((flags & F_SHIP) == 0u) {
      let cxp = b.gx + b.gw * 0.5;
      let cyp = b.gy + b.gh * 0.5;
      let ddx = hx - cxp;
      let ddy = hy - cyp;
      let r2 = ddx * ddx + ddy * ddy;
      if (r2 < 0.1024) {
        let q = 1.0 - sqrt(r2) * (1.0 / 0.32);
        col = pack_color(255.0, 150.0 + 90.0 * q, 60.0 + 150.0 * q);
        glow = pack_color(255.0 * q, 120.0 * q, 30.0 * q);
      } else {
        let l = min(lvlf(d) + 6u, 15u);
        col = sample_texlv(tex, l, tx, ty);
        glow = 0u;
      }
    } else {
      let l = min(lvlf(d) + 1u, 15u);
      if (b_ao != 0u) {
        a = a0 * ao_floor(b_ao, hx, hy);
      }
      col = sample_texlv(tex, l, tx, ty);
      glow = sample_texgl(tex, tx, ty);
    }
    nrm = 1u;
  }

  let amb_u8 = clamp(u32(a * 255.0), 0u, 255u);
  let packed_meta = nrm | (amb_u8 << 8u) | ((flags & 0xffu) << 16u) | ((hit_kind & 0xffu) << 24u);

  gbuf[out_base] = col;
  gbuf[out_base + 1u] = bitcast<u32>(d);
  gbuf[out_base + 2u] = packed_meta;
  gbuf[out_base + 3u] = glow;
}
