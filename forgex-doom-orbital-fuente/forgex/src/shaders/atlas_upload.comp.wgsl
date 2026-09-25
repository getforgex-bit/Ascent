@group(0) @binding(0) var<storage, read> atlas_data: array<u32>;
@group(1) @binding(0) var atlas_tex: texture_storage_2d<rgba8uint, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = 2048u;
  let h = 4096u;
  if (gid.x >= w || gid.y >= h) {
    return;
  }
  let idx = gid.y * w + gid.x;
  let c = atlas_data[idx];
  // Desempaquetar 0xAABBGGRR (formato little-endian en memoria de Rust/JS)
  let r = c & 0xffu;
  let g = (c >> 8u) & 0xffu;
  let b = (c >> 16u) & 0xffu;
  let a = (c >> 24u) & 0xffu;
  textureStore(atlas_tex, vec2<i32>(gid.xy), vec4<u32>(r, g, b, a));
}
