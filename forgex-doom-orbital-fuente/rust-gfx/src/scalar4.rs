// Emulación escalar de las instrucciones SIMD de 128 bits que usa el pase de luz.
// Se compila SOLO en la variante sin SIMD (navegadores sin WebAssembly SIMD): define los mismos nombres
// que core::arch::wasm32 y, al ser ítems locales, tienen prioridad sobre el `use core::arch::wasm32::*`.
// El resultado es bit a bit el mismo que la ruta SIMD (mismas operaciones, lane por lane); solo es más lento.
#[allow(non_camel_case_types)]
#[derive(Copy, Clone)]
#[repr(C, align(16))]
pub struct v128([u32; 4]);
#[inline(always)] fn fl(v: v128) -> [f32; 4] { [f32::from_bits(v.0[0]), f32::from_bits(v.0[1]), f32::from_bits(v.0[2]), f32::from_bits(v.0[3])] }
#[inline(always)] fn vf(a: [f32; 4]) -> v128 { v128([a[0].to_bits(), a[1].to_bits(), a[2].to_bits(), a[3].to_bits()]) }
#[inline(always)] fn map2(a: v128, b: v128, f: impl Fn(f32, f32) -> f32) -> v128 { let (x, y) = (fl(a), fl(b)); vf([f(x[0], y[0]), f(x[1], y[1]), f(x[2], y[2]), f(x[3], y[3])]) }
#[inline(always)] fn cmp2(a: v128, b: v128, f: impl Fn(f32, f32) -> bool) -> v128 { let (x, y) = (fl(a), fl(b)); mask4([f(x[0], y[0]), f(x[1], y[1]), f(x[2], y[2]), f(x[3], y[3])]) }
#[inline(always)] fn ucmp2(a: v128, b: v128, f: impl Fn(u32, u32) -> bool) -> v128 { mask4([f(a.0[0], b.0[0]), f(a.0[1], b.0[1]), f(a.0[2], b.0[2]), f(a.0[3], b.0[3])]) }

#[inline(always)] pub fn f32x4(a: f32, b: f32, c: f32, d: f32) -> v128 { vf([a, b, c, d]) }
#[inline(always)] pub fn f32x4_splat(a: f32) -> v128 { vf([a, a, a, a]) }
#[inline(always)] pub fn f32x4_add(a: v128, b: v128) -> v128 { map2(a, b, |x, y| x + y) }
#[inline(always)] pub fn f32x4_sub(a: v128, b: v128) -> v128 { map2(a, b, |x, y| x - y) }
#[inline(always)] pub fn f32x4_mul(a: v128, b: v128) -> v128 { map2(a, b, |x, y| x * y) }
#[inline(always)] pub fn f32x4_div(a: v128, b: v128) -> v128 { map2(a, b, |x, y| x / y) }
#[inline(always)] pub fn f32x4_pmin(a: v128, b: v128) -> v128 { map2(a, b, |x, y| if y < x { y } else { x }) }
#[inline(always)] pub fn f32x4_pmax(a: v128, b: v128) -> v128 { map2(a, b, |x, y| if x < y { y } else { x }) }
#[inline(always)] pub fn f32x4_sqrt(a: v128) -> v128 { let x = fl(a); vf([f32_sqrt(x[0]), f32_sqrt(x[1]), f32_sqrt(x[2]), f32_sqrt(x[3])]) }
#[inline(always)] pub fn f32x4_abs(a: v128) -> v128 { v128([a.0[0] & 0x7fff_ffff, a.0[1] & 0x7fff_ffff, a.0[2] & 0x7fff_ffff, a.0[3] & 0x7fff_ffff]) }
#[inline(always)] pub fn f32x4_ge(a: v128, b: v128) -> v128 { cmp2(a, b, |x, y| x >= y) }
#[inline(always)] pub fn f32x4_gt(a: v128, b: v128) -> v128 { cmp2(a, b, |x, y| x > y) }
#[inline(always)] pub fn f32x4_le(a: v128, b: v128) -> v128 { cmp2(a, b, |x, y| x <= y) }
#[inline(always)] pub fn f32x4_lt(a: v128, b: v128) -> v128 { cmp2(a, b, |x, y| x < y) }
#[inline(always)] pub fn f32x4_convert_i32x4(a: v128) -> v128 { vf([a.0[0] as i32 as f32, a.0[1] as i32 as f32, a.0[2] as i32 as f32, a.0[3] as i32 as f32]) }
#[inline(always)] pub fn i32x4_trunc_sat_f32x4(a: v128) -> v128 { let x = fl(a); v128([x[0] as i32 as u32, x[1] as i32 as u32, x[2] as i32 as u32, x[3] as i32 as u32]) }
#[inline(always)] pub fn i32x4_eq(a: v128, b: v128) -> v128 { ucmp2(a, b, |x, y| x == y) }
#[inline(always)] pub fn i32x4_shuffle<const A: usize, const B: usize, const C: usize, const D: usize>(a: v128, b: v128) -> v128 {
    let g = |k: usize| if k < 4 { a.0[k] } else { b.0[k - 4] };
    v128([g(A), g(B), g(C), g(D)])
}
#[inline(always)] pub fn u32x4(a: u32, b: u32, c: u32, d: u32) -> v128 { v128([a, b, c, d]) }
#[inline(always)] pub fn u32x4_splat(a: u32) -> v128 { v128([a, a, a, a]) }
#[inline(always)] pub fn u32x4_ge(a: v128, b: v128) -> v128 { ucmp2(a, b, |x, y| x >= y) }
#[inline(always)] pub fn u32x4_le(a: v128, b: v128) -> v128 { ucmp2(a, b, |x, y| x <= y) }
#[inline(always)] pub fn u32x4_shl(a: v128, n: u32) -> v128 { let n = n & 31; v128([a.0[0] << n, a.0[1] << n, a.0[2] << n, a.0[3] << n]) }
#[inline(always)] pub fn u32x4_shr(a: v128, n: u32) -> v128 { let n = n & 31; v128([a.0[0] >> n, a.0[1] >> n, a.0[2] >> n, a.0[3] >> n]) }
#[inline(always)] pub fn v128_and(a: v128, b: v128) -> v128 { v128([a.0[0] & b.0[0], a.0[1] & b.0[1], a.0[2] & b.0[2], a.0[3] & b.0[3]]) }
#[inline(always)] pub fn v128_or(a: v128, b: v128) -> v128 { v128([a.0[0] | b.0[0], a.0[1] | b.0[1], a.0[2] | b.0[2], a.0[3] | b.0[3]]) }
#[inline(always)] pub fn v128_bitselect(a: v128, b: v128, m: v128) -> v128 {
    v128([(a.0[0] & m.0[0]) | (b.0[0] & !m.0[0]), (a.0[1] & m.0[1]) | (b.0[1] & !m.0[1]), (a.0[2] & m.0[2]) | (b.0[2] & !m.0[2]), (a.0[3] & m.0[3]) | (b.0[3] & !m.0[3])])
}
#[inline(always)] pub fn v128_any_true(a: v128) -> bool { (a.0[0] | a.0[1] | a.0[2] | a.0[3]) != 0 }
#[inline(always)] pub unsafe fn v128_load(p: *const v128) -> v128 { core::ptr::read_unaligned(p) }
#[inline(always)] pub fn u64x2(lo: u64, hi: u64) -> v128 { v128([lo as u32, (lo >> 32) as u32, hi as u32, (hi >> 32) as u32]) }
#[inline(always)] pub fn u64x2_extract_lane<const N: usize>(a: v128) -> u64 { (a.0[N * 2] as u64) | ((a.0[N * 2 + 1] as u64) << 32) }
