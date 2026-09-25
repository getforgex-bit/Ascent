// FORGEX DOOM Orbital — sprite.comp.wgsl (Agente B)
// Rasterizado de sprites sobre el G-buffer con prueba de profundidad.

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

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.res.x || gid.y >= u.res.y) {
    return;
  }
  let px_idx = gid.y * u.res.x + gid.x;
  let out_base = px_idx * 4u;
  var cur_d = bitcast<f32>(gbuf[out_base + 1u]);

  let fx = f32(gid.x);
  let fy = f32(gid.y);

  let n_spr = u.n_sprites;
  for (var k = 0u; k < n_spr; k++) {
    let s = sprites[k];
    if (s.side == 0u || !(s.x1 > s.x0) || !(s.y1 > s.y0)) {
      continue;
    }
    if (fx >= s.x0 && fx < s.x1 && fy >= s.y0 && fy < s.y1) {
      if (cur_d <= s.depth || s.depth < 0.05) {
        continue;
      }
      let kx = f32(s.side) / (s.x1 - s.x0);
      let ky = f32(s.side) / (s.y1 - s.y0);
      let tx = clamp(i32((fx - s.x0) * kx), 0, i32(s.side) - 1);
      let ty = clamp(i32((fy - s.y0) * ky), 0, i32(s.side) - 1);

      let linear_off = s.atlas_off + u32(ty * i32(s.side) + tx);
      let atlas_x = i32(linear_off % 2048u);
      let atlas_y = 1024 + i32(linear_off / 2048u);

      let t = textureLoad(atlas_tex, vec2<i32>(atlas_x, atlas_y), 0);
      let raw = t.r | (t.g << 8u) | (t.b << 16u) | (t.a << 24u);
      if (raw == 0u) {
        continue;
      }

      cur_d = s.depth;
      let c = raw | 0xff000000u;
      let amb_u8 = clamp(u32(s.light * 255.0), 0u, 255u);

      gbuf[out_base] = c;
      gbuf[out_base + 1u] = bitcast<u32>(s.depth);
      gbuf[out_base + 2u] = 6u | (amb_u8 << 8u); // normal = 6 (sprite)
      let is_glow = (t.a == 0xfeu);
      gbuf[out_base + 3u] = select(0u, c, is_glow);
    }
  }
}
