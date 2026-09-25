//! Operaciones SIMD de 128 bits para física, distancias y combate.
#![allow(dead_code)]

#[cfg(target_feature = "simd128")]
use core::arch::wasm32::*;

#[cfg(target_feature = "simd128")]
#[inline(always)]
pub unsafe fn sep4(px: f32, py: f32, x4: v128, y4: v128) -> v128 {
    let dx = f32x4_sub(x4, f32x4_splat(px));
    let dy = f32x4_sub(y4, f32x4_splat(py));
    f32x4_sqrt(f32x4_add(f32x4_mul(dx, dx), f32x4_mul(dy, dy)))
}

#[cfg(target_feature = "simd128")]
#[inline(always)]
pub unsafe fn dist4(px: f32, py: f32, pz: f32, x4: v128, y4: v128, z4: v128) -> v128 {
    let dx = f32x4_sub(x4, f32x4_splat(px));
    let dy = f32x4_sub(y4, f32x4_splat(py));
    let dz = f32x4_sub(z4, f32x4_splat(pz));
    f32x4_sqrt(f32x4_add(f32x4_add(f32x4_mul(dx, dx), f32x4_mul(dy, dy)), f32x4_mul(dz, dz)))
}

#[cfg(target_feature = "simd128")]
#[inline(always)]
pub unsafe fn simd_los4(px: f32, py: f32, pz: f32, x4: v128, y4: v128, z4: v128) -> v128 {
    let xs: [f32; 4] = core::mem::transmute(x4);
    let ys: [f32; 4] = core::mem::transmute(y4);
    let zs: [f32; 4] = core::mem::transmute(z4);
    let mut res = [0u32; 4];
    for i in 0..4 {
        if crate::world::clear_path(px, py, pz, xs[i], ys[i], zs[i]) {
            res[i] = 0xFFFF_FFFF;
        }
    }
    core::mem::transmute(res)
}

#[cfg(target_feature = "simd128")]
#[inline(always)]
pub unsafe fn simd_damage4(hp4: v128, dmg4: v128) -> (v128, v128) {
    let new_hp = f32x4_sub(hp4, dmg4);
    let dead = f32x4_le(new_hp, f32x4_splat(0.0));
    (new_hp, dead)
}

// ================= Ganchos C-ABI para pruebas =================

#[no_mangle]
pub unsafe extern "C" fn test_sep4(
    px: f32, py: f32,
    x_ptr: *const f32, y_ptr: *const f32,
    out_ptr: *mut f32,
) {
    #[cfg(target_feature = "simd128")]
    {
        let x4 = core::ptr::read_unaligned(x_ptr as *const v128);
        let y4 = core::ptr::read_unaligned(y_ptr as *const v128);
        let res = sep4(px, py, x4, y4);
        core::ptr::copy_nonoverlapping(&res as *const _ as *const f32, out_ptr, 4);
    }
    #[cfg(not(target_feature = "simd128"))]
    {
        crate::scalar_simd::test_sep4_scalar(px, py, x_ptr, y_ptr, out_ptr);
    }
}

#[no_mangle]
pub unsafe extern "C" fn test_dist4(
    px: f32, py: f32, pz: f32,
    x_ptr: *const f32, y_ptr: *const f32, z_ptr: *const f32,
    out_ptr: *mut f32,
) {
    #[cfg(target_feature = "simd128")]
    {
        let x4 = core::ptr::read_unaligned(x_ptr as *const v128);
        let y4 = core::ptr::read_unaligned(y_ptr as *const v128);
        let z4 = core::ptr::read_unaligned(z_ptr as *const v128);
        let res = dist4(px, py, pz, x4, y4, z4);
        core::ptr::copy_nonoverlapping(&res as *const _ as *const f32, out_ptr, 4);
    }
    #[cfg(not(target_feature = "simd128"))]
    {
        crate::scalar_simd::test_dist4_scalar(px, py, pz, x_ptr, y_ptr, z_ptr, out_ptr);
    }
}

#[no_mangle]
pub unsafe extern "C" fn test_simd_los4(
    px: f32, py: f32, pz: f32,
    x_ptr: *const f32, y_ptr: *const f32, z_ptr: *const f32,
    out_ptr: *mut u32,
) {
    #[cfg(target_feature = "simd128")]
    {
        let x4 = core::ptr::read_unaligned(x_ptr as *const v128);
        let y4 = core::ptr::read_unaligned(y_ptr as *const v128);
        let z4 = core::ptr::read_unaligned(z_ptr as *const v128);
        let res = simd_los4(px, py, pz, x4, y4, z4);
        core::ptr::copy_nonoverlapping(&res as *const _ as *const u32, out_ptr, 4);
    }
    #[cfg(not(target_feature = "simd128"))]
    {
        crate::scalar_simd::test_simd_los4_scalar(px, py, pz, x_ptr, y_ptr, z_ptr, out_ptr);
    }
}

#[no_mangle]
pub unsafe extern "C" fn test_simd_damage4(
    hp_ptr: *const f32, dmg_ptr: *const f32,
    out_hp_ptr: *mut f32, out_dead_ptr: *mut u32,
) {
    #[cfg(target_feature = "simd128")]
    {
        let hp4 = core::ptr::read_unaligned(hp_ptr as *const v128);
        let dmg4 = core::ptr::read_unaligned(dmg_ptr as *const v128);
        let (new_hp, dead) = simd_damage4(hp4, dmg4);
        core::ptr::copy_nonoverlapping(&new_hp as *const _ as *const f32, out_hp_ptr, 4);
        core::ptr::copy_nonoverlapping(&dead as *const _ as *const u32, out_dead_ptr, 4);
    }
    #[cfg(not(target_feature = "simd128"))]
    {
        crate::scalar_simd::test_simd_damage4_scalar(hp_ptr, dmg_ptr, out_hp_ptr, out_dead_ptr);
    }
}
