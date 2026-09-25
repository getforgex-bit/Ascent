//! Emulación escalar de las operaciones vectoriales (para la variante WebAssembly MVP sin SIMD).
#![allow(dead_code)]

use core::arch::wasm32::f32_sqrt;

#[inline(always)]
pub fn sep4_scalar(px: f32, py: f32, x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    let mut out = [0.0f32; 4];
    for i in 0..4 {
        let dx = x[i] - px;
        let dy = y[i] - py;
        out[i] = f32_sqrt(dx * dx + dy * dy);
    }
    out
}

#[inline(always)]
pub fn dist4_scalar(px: f32, py: f32, pz: f32, x: [f32; 4], y: [f32; 4], z: [f32; 4]) -> [f32; 4] {
    let mut out = [0.0f32; 4];
    for i in 0..4 {
        let dx = x[i] - px;
        let dy = y[i] - py;
        let dz = z[i] - pz;
        out[i] = f32_sqrt(dx * dx + dy * dy + dz * dz);
    }
    out
}

#[inline(always)]
pub unsafe fn simd_los4_scalar(px: f32, py: f32, pz: f32, x: [f32; 4], y: [f32; 4], z: [f32; 4]) -> [u32; 4] {
    let mut out = [0u32; 4];
    for i in 0..4 {
        if crate::world::clear_path(px, py, pz, x[i], y[i], z[i]) {
            out[i] = 0xFFFF_FFFF;
        }
    }
    out
}

#[inline(always)]
pub fn simd_damage4_scalar(hp: [f32; 4], dmg: [f32; 4]) -> ([f32; 4], [u32; 4]) {
    let mut new_hp = [0.0f32; 4];
    let mut dead = [0u32; 4];
    for i in 0..4 {
        new_hp[i] = hp[i] - dmg[i];
        dead[i] = if new_hp[i] <= 0.0 { 0xFFFF_FFFF } else { 0 };
    }
    (new_hp, dead)
}

// ================= Ganchos C-ABI para pruebas =================

#[no_mangle]
pub unsafe extern "C" fn test_sep4_scalar(
    px: f32, py: f32,
    x_ptr: *const f32, y_ptr: *const f32,
    out_ptr: *mut f32,
) {
    let mut x = [0.0f32; 4];
    let mut y = [0.0f32; 4];
    core::ptr::copy_nonoverlapping(x_ptr, x.as_mut_ptr(), 4);
    core::ptr::copy_nonoverlapping(y_ptr, y.as_mut_ptr(), 4);
    let res = sep4_scalar(px, py, x, y);
    core::ptr::copy_nonoverlapping(res.as_ptr(), out_ptr, 4);
}

#[no_mangle]
pub unsafe extern "C" fn test_dist4_scalar(
    px: f32, py: f32, pz: f32,
    x_ptr: *const f32, y_ptr: *const f32, z_ptr: *const f32,
    out_ptr: *mut f32,
) {
    let mut x = [0.0f32; 4];
    let mut y = [0.0f32; 4];
    let mut z = [0.0f32; 4];
    core::ptr::copy_nonoverlapping(x_ptr, x.as_mut_ptr(), 4);
    core::ptr::copy_nonoverlapping(y_ptr, y.as_mut_ptr(), 4);
    core::ptr::copy_nonoverlapping(z_ptr, z.as_mut_ptr(), 4);
    let res = dist4_scalar(px, py, pz, x, y, z);
    core::ptr::copy_nonoverlapping(res.as_ptr(), out_ptr, 4);
}

#[no_mangle]
pub unsafe extern "C" fn test_simd_los4_scalar(
    px: f32, py: f32, pz: f32,
    x_ptr: *const f32, y_ptr: *const f32, z_ptr: *const f32,
    out_ptr: *mut u32,
) {
    let mut x = [0.0f32; 4];
    let mut y = [0.0f32; 4];
    let mut z = [0.0f32; 4];
    core::ptr::copy_nonoverlapping(x_ptr, x.as_mut_ptr(), 4);
    core::ptr::copy_nonoverlapping(y_ptr, y.as_mut_ptr(), 4);
    core::ptr::copy_nonoverlapping(z_ptr, z.as_mut_ptr(), 4);
    let res = simd_los4_scalar(px, py, pz, x, y, z);
    core::ptr::copy_nonoverlapping(res.as_ptr(), out_ptr, 4);
}

#[no_mangle]
pub unsafe extern "C" fn test_simd_damage4_scalar(
    hp_ptr: *const f32, dmg_ptr: *const f32,
    out_hp_ptr: *mut f32, out_dead_ptr: *mut u32,
) {
    let mut hp = [0.0f32; 4];
    let mut dmg = [0.0f32; 4];
    core::ptr::copy_nonoverlapping(hp_ptr, hp.as_mut_ptr(), 4);
    core::ptr::copy_nonoverlapping(dmg_ptr, dmg.as_mut_ptr(), 4);
    let (new_hp, dead) = simd_damage4_scalar(hp, dmg);
    core::ptr::copy_nonoverlapping(new_hp.as_ptr(), out_hp_ptr, 4);
    core::ptr::copy_nonoverlapping(dead.as_ptr(), out_dead_ptr, 4);
}
