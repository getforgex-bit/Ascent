//! Texturas, cielo, atlas de sprites y arrays de partículas.
#![allow(static_mut_refs)]

use core::arch::wasm32::{f32_floor, f32_sqrt};
use crate::contracts::*;

pub const TAU: f32 = 6.283_185_5;
pub const PI: f32 = 3.141_592_7;
pub const HALF_PI: f32 = 1.570_796_3;

#[inline(always)]
pub(crate) fn fabs(x: f32) -> f32 { if x < 0.0 { -x } else { x } }
#[inline(always)]
pub(crate) fn fmin(a: f32, b: f32) -> f32 { if a < b { a } else { b } }
#[inline(always)]
pub(crate) fn fmax(a: f32, b: f32) -> f32 { if a > b { a } else { b } }
#[inline(always)]
pub(crate) fn imin(a: i32, b: i32) -> i32 { if a < b { a } else { b } }
#[inline(always)]
pub(crate) fn imax(a: i32, b: i32) -> i32 { if a > b { a } else { b } }

#[inline(always)]
pub(crate) fn atan(x: f32) -> f32 {
    let x2 = x * x;
    x * (0.999_866 + x2 * (-0.330_299_5 + x2 * (0.180_141 + x2 * (-0.085_133 + x2 * 0.020_835_1))))
}

#[inline(always)]
pub(crate) fn atan2f(y: f32, x: f32) -> f32 {
    let (ax, ay) = (fabs(x), fabs(y));
    let a = atan(fmin(ax, ay) / fmax(fmax(ax, ay), 1e-30));
    let a = if ay > ax { HALF_PI - a } else { a };
    let a = if x < 0.0 { PI - a } else { a };
    if y < 0.0 { -a } else { a }
}

// ---------------- recursos (los llena JS una vez) ----------------
pub(crate) static mut TEXLV: [u32; NTEX * NL * TT] = [0; NTEX * NL * TT];
pub(crate) static mut TEXEM: [u8; NTEX * TT] = [0; NTEX * TT];
pub(crate) static mut TEXGL: [u32; NTEX * TT] = [0; NTEX * TT];
pub(crate) static mut RIM: [u32; NTEX * NL] = [0; NTEX * NL];
pub(crate) static mut RIMG: [u32; NTEX * NL] = [0; NTEX * NL];
pub(crate) static mut SKY: [u32; (SKW * SKH) as usize] = [0; (SKW * SKH) as usize];
pub(crate) static mut PADG: u32 = 0;
pub(crate) static mut DARK: u32 = 0;

#[no_mangle] pub unsafe extern "C" fn p_texlv() -> *mut u32 { TEXLV.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_texem() -> *mut u8 { TEXEM.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_texgl() -> *mut u32 { TEXGL.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_rim() -> *mut u32 { RIM.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_rimg() -> *mut u32 { RIMG.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_sky() -> *mut u32 { SKY.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn set_consts(padg: u32, dark: u32) { PADG = padg; DARK = dark; }

/// Color del cielo en la dirección (dx, dy, dz): acimut → columna, elevación → fila.
#[inline(always)]
pub(crate) unsafe fn sky_dir(dx: f32, dy: f32, dz: f32) -> u32 {
    let rxy = f32_sqrt(dx * dx + dy * dy);
    let mut u = atan2f(dy, dx) * (1.0 / TAU);
    u -= f32_floor(u);
    let v = 0.5 - atan2f(dz, rxy) * (1.0 / PI);
    let sx = imax(0, imin((u * SKW as f32) as i32, SKW - 1));
    let sy = imax(0, imin((v * SKH as f32) as i32, SKH - 1));
    *SKY.get_unchecked((sy * SKW + sx) as usize)
}

// ---------------- atlas y sprites ----------------
pub(crate) const ATLAS_MAX: usize = 1 << 21;
pub(crate) static mut ATLAS: [u32; ATLAS_MAX] = [0; ATLAS_MAX];
#[no_mangle] pub unsafe extern "C" fn p_atlas() -> *mut u32 { ATLAS.as_mut_ptr() }
#[no_mangle] pub extern "C" fn atlas_max() -> i32 { ATLAS_MAX as i32 }

pub(crate) const MAXSPR: usize = 512;
/// [desplazamiento en el atlas, lado n, x0, x1, y0, y1, profundidad, luz ambiente] × n
pub(crate) static mut SPRI: [f32; MAXSPR * 8] = [0.0; MAXSPR * 8];
#[no_mangle] pub unsafe extern "C" fn p_spr() -> *mut f32 { SPRI.as_mut_ptr() }
#[no_mangle] pub extern "C" fn spr_max() -> i32 { MAXSPR as i32 }

// ---------------- partículas ----------------
pub(crate) const MAXPT: usize = 4096;
pub(crate) static mut PTX: [f32; MAXPT] = [0.0; MAXPT];
pub(crate) static mut PTY: [f32; MAXPT] = [0.0; MAXPT];
pub(crate) static mut PTZ: [f32; MAXPT] = [0.0; MAXPT];
pub(crate) static mut PTC: [u32; MAXPT] = [0; MAXPT];
#[no_mangle] pub unsafe extern "C" fn p_ptx() -> *mut f32 { PTX.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_pty() -> *mut f32 { PTY.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_ptz() -> *mut f32 { PTZ.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_ptc() -> *mut u32 { PTC.as_mut_ptr() }
#[no_mangle] pub extern "C" fn pt_max() -> i32 { MAXPT as i32 }
