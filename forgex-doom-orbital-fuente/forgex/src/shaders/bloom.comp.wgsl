// FORGEX DOOM Orbital — bloom.comp.wgsl (Agente B)
// Reducción 4x4 de píxeles emisivos (glow) + blur gaussiano separable de 9 taps en compute shader.

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

// Memoria compartida de workgroup para 16x16 tiles de bloom (8x8 tiles centrales + halo de 4)
var<workgroup> s_tile: array<array<vec3<f32>, 16>, 16>;

fn sample_tile_glow(tx: i32, ty: i32, bw: i32, bh: i32) -> vec3<f32> {
  let cx = clamp(tx, 0, bw - 1);
  let cy = clamp(ty, 0, bh - 1);
  var r = 0.0;
  var g = 0.0;
  var b = 0.0;
  let base_x = u32(cx) * 4u;
  let base_y = u32(cy) * 4u;

  for (var dy = 0u; dy < 4u; dy++) {
    for (var dx = 0u; dx < 4u; dx++) {
      let px = base_x + dx;
      let py = base_y + dy;
      if (px < u.res.x && py < u.res.y) {
        let glow = gbuf[(py * u.res.x + px) * 4u + 3u];
        if (glow != 0u) {
          r += f32(glow & 255u);
          g += f32((glow >> 8u) & 255u);
          b += f32((glow >> 16u) & 255u);
        }
      }
    }
  }
  // Escala equivalente a (r * 3 / 32) / 255.0 de la ruta CPU
  let scale = (3.0 / 32.0) / 255.0;
  return vec3<f32>(r, g, b) * scale;
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>
) {
  let bw = i32(u.res.x / 4u);
  let bh = i32(u.res.y / 4u);

  // Cada grupo de 8x8 hilos carga 16x16 celdas compartidas (4 celdas por hilo)
  let linear_tid = lid.y * 8u + lid.x;
  let base_tx = i32(wid.x * 8u) - 4;
  let base_ty = i32(wid.y * 8u) - 4;

  for (var k = 0u; k < 4u; k++) {
    let slot = linear_tid + k * 64u;
    let sx = slot % 16u;
    let sy = slot / 16u;
    let tx = base_tx + i32(sx);
    let ty = base_ty + i32(sy);
    s_tile[sy][sx] = sample_tile_glow(tx, ty, bw, bh);
  }

  workgroupBarrier();

  if (i32(gid.x) >= bw || i32(gid.y) >= bh) {
    return;
  }

  // Kernel gaussiano de 9 taps separable
  // Pesos normalizados: 0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05 (suma = 1.0)
  let w = array<f32, 9>(0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05);

  let center_x = lid.x + 4u;
  let center_y = lid.y + 4u;

  var blurred = vec3<f32>(0.0);
  for (var dy = 0u; dy < 9u; dy++) {
    let sy = center_y + dy - 4u;
    var row_col = vec3<f32>(0.0);
    for (var dx = 0u; dx < 9u; dx++) {
      let sx = center_x + dx - 4u;
      row_col += s_tile[sy][sx] * w[dx];
    }
    blurred += row_col * w[dy];
  }

  let r_u8 = clamp(u32(blurred.r * 255.0), 0u, 255u);
  let g_u8 = clamp(u32(blurred.g * 255.0), 0u, 255u);
  let b_u8 = clamp(u32(blurred.b * 255.0), 0u, 255u);
  let packed = r_u8 | (g_u8 << 8u) | (b_u8 << 16u) | 0xff000000u;

  let out_idx = gid.y * u32(bw) + gid.x;
  bloom_buf[out_idx] = packed;
}
