//! Canal de renderizado CPU: raycasting por columnas, raytracing 3D, iluminación diferida SIMD/escalar,
//! sprites, partículas y reducción de bloom.
#![allow(static_mut_refs)]
#![allow(unused_variables)]

use core::arch::wasm32::*;
use crate::contracts::*;
use crate::world::{HEAD, BL, CZ, ZMIN, ZMAX, Block, occluded};
use crate::atlas::{
    TEXLV, TEXEM, TEXGL, RIM, RIMG, SKY, PADG, DARK,
    ATLAS, ATLAS_MAX, SPRI, MAXSPR,
    PTX, PTY, PTZ, PTC, MAXPT,
    sky_dir, atan2f, TAU, PI,
};

#[no_mangle]
pub extern "C" fn dims() -> i32 { MW * 10000 + T }
#[no_mangle]
pub extern "C" fn sky_dims() -> i32 { SKW * 10000 + SKH }

const BLACK: u32 = 0xff00_0000;
const AMB_IN: f32 = 0.3;
const AMB_OUT: f32 = 0.95;

// ---------------- buffers por píxel (JS los ve como TypedArrays) ----------------
pub(crate) static mut BUF: [u32; MAXP] = [0; MAXP];
pub(crate) static mut GBUF: [u32; MAXP] = [0; MAXP];
pub(crate) static mut DEPTH: [f32; MAXP] = [0.0; MAXP];
static mut AMB: [f32; MAXP] = [0.0; MAXP];
static mut NRM: [u8; MAXP] = [0; MAXP];
static mut LIGHTS: [f32; MAXL * 8] = [0.0; MAXL * 8];
static mut SHAD: [f32; MAXS * 5] = [0.0; MAXS * 5];

#[no_mangle] pub unsafe extern "C" fn p_buf() -> *mut u32 { BUF.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_gbuf() -> *mut u32 { GBUF.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_depth() -> *mut f32 { DEPTH.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_amb() -> *mut f32 { AMB.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_nrm() -> *mut u8 { NRM.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_lights() -> *mut f32 { LIGHTS.as_mut_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_shad() -> *mut f32 { SHAD.as_mut_ptr() }

// ---------------- estado de cámara del fotograma ----------------
static mut RW: i32 = 480;
static mut RH: i32 = 300;
static mut CPX: f32 = 0.0;
static mut CPY: f32 = 0.0;
static mut CAMZ: f32 = 0.0;
static mut HOR: f32 = 0.0;
static mut PROJ: f32 = 1.0;
static mut ACID: i32 = 0;

#[inline(always)]
fn fabs(x: f32) -> f32 { if x < 0.0 { -x } else { x } }
#[inline(always)]
fn fmin(a: f32, b: f32) -> f32 { if a < b { a } else { b } }
#[inline(always)]
fn fmax(a: f32, b: f32) -> f32 { if a > b { a } else { b } }
#[inline(always)]
fn imin(a: i32, b: i32) -> i32 { if a < b { a } else { b } }
#[inline(always)]
fn imax(a: i32, b: i32) -> i32 { if a > b { a } else { b } }
#[inline(always)]
fn clamp255(v: f32) -> u32 { if v <= 0.0 { 0 } else if v >= 255.0 { 255 } else { v as u32 } }
#[inline(always)]
fn pack(r: f32, g: f32, b: f32) -> u32 { BLACK | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r) }

macro_rules! rd { ($a:ident [ $i:expr ]) => { *$a.get_unchecked($i) } }
macro_rules! wr { ($a:ident [ $i:expr ] = $v:expr) => { *$a.get_unchecked_mut($i) = $v } }

const EMPTY: u8 = 255;
const SKYN: u8 = 7;

static mut RINV: [f32; 512] = [0.0; 512];
static mut COLX: [f32; 808] = [0.0; 808];
static mut COLY: [f32; 808] = [0.0; 808];
static mut COLZ: [f32; 808] = [0.0; 808];
static mut ROWX: [f32; 512] = [0.0; 512];
static mut ROWY: [f32; 512] = [0.0; 512];
static mut ROWZ: [f32; 512] = [0.0; 512];
static mut FLATD: f32 = 0.0;

#[inline(always)]
unsafe fn put(i: usize, col: u32, d: f32, _x: f32, _y: f32, _z: f32, n: u8, a: f32) {
    wr!(BUF[i] = col); wr!(DEPTH[i] = d); wr!(NRM[i] = n); wr!(AMB[i] = a);
}

#[inline(always)]
fn ao_floor(ao: u8, wx: f32, wy: f32) -> f32 {
    let fx = wx - f32_floor(wx);
    let fy = wy - f32_floor(wy);
    let mut m = 1.0f32;
    if ao & 1 != 0 { m = fmin(m, fx * 2.5); }
    if ao & 2 != 0 { m = fmin(m, (1.0 - fx) * 2.5); }
    if ao & 4 != 0 { m = fmin(m, fy * 2.5); }
    if ao & 8 != 0 { m = fmin(m, (1.0 - fy) * 2.5); }
    if m < 1.0 { 0.38 + 0.62 * m } else { 1.0 }
}

const INV_LVL: f32 = 1.0 / 2.4;
#[inline(always)]
fn lvlf(d: f32) -> usize { let l = (d * INV_LVL) as usize; if l > NL - 1 { NL - 1 } else { l } }

unsafe fn draw_cell(x: i32, head: u32, near: f32, far: f32, side: i32, rdx: f32, rdy: f32, own: bool) -> i32 {
    let (px, py, camz, hor, proj, rh) = (CPX, CPY, CAMZ, HOR, PROJ, RH);
    let mut filled = 0i32;
    let col = (x * rh) as usize;
    let nr = fmax(near, 0.02);
    let inv_nr = 1.0 / nr;
    let inv_far = 1.0 / far;
    let tf = T as f32;
    if !own {
        let mut wx = if side == 0 { py + nr * rdy } else { px + nr * rdx };
        wx -= f32_floor(wx);
        let hx = px + nr * rdx;
        let hy = py + nr * rdy;
        let tx = imin((wx * tf) as i32, TM);
        let l0 = lvlf(nr);
        let nrm: u8 = if side == 0 { if rdx > 0.0 { 3 } else { 2 } } else if rdy > 0.0 { 5 } else { 4 };
        let li = { let l = l0 + 1 + (side as usize) * 2; if l > NL - 1 { NL - 1 } else { l } };
        let mut bi = head;
        while bi != 0 {
            let b = rd!(BL[(bi - 1) as usize]);
            bi = b.next;
            let ytn = hor - (b.zt - camz) * proj * inv_nr;
            let ybn = hor - (b.zb - camz) * proj * inv_nr;
            let ya = imax(0, f32_ceil(ytn) as i32);
            let yb = imin(rh, f32_ceil(ybn) as i32);
            if ya >= yb { continue; }
            let tex = b.tex as usize;
            let tbase = (tex * NL + li) * TT;
            let th = b.zt - b.zb;
            let kz = th / (ybn - ytn);
            let ship = b.flags & F_SHIP != 0;
            let rim = b.flags & F_RIM != 0;
            let base_a = if ship { AMB_IN } else { AMB_OUT };
            let rimc = rd!(RIM[tex * NL + l0]);
            let rimg = rd!(RIMG[tex * NL + l0]);
            for y in ya..yb {
                let i = col + y as usize;
                if rd!(NRM[i]) != EMPTY { continue; }
                filled += 1;
                let zz = (y as f32 - ytn) * kz;
                let wz = b.zt - zz;
                if rim && zz < 0.045 {
                    put(i, rimc, nr, hx, hy, wz, nrm, base_a);
                    wr!(GBUF[i] = rimg);
                } else if rim && th - zz < 0.03 {
                    put(i, DARK, nr, hx, hy, wz, nrm, base_a);
                } else {
                    let mut a = base_a;
                    if ship {
                        let up = th - zz;
                        if up < 0.45 { a *= 0.35 + 0.65 * up * (1.0 / 0.45); }
                        if zz < 0.3 { a *= 0.55 + 0.45 * zz * (1.0 / 0.3); }
                    }
                    let k = (((((-wz * tf) as i32) & TM) * T) + tx) as usize;
                    put(i, rd!(TEXLV[tbase + k]), nr, hx, hy, wz, nrm, a);
                    if rd!(TEXEM[tex * TT + k]) != 0 { wr!(GBUF[i] = rd!(TEXGL[tex * TT + k])); }
                }
            }
        }
    }
    let mut bi = head;
    while bi != 0 {
        let b = rd!(BL[(bi - 1) as usize]);
        bi = b.next;
        let tex = b.tex as usize;
        let a0 = if b.flags & F_SHIP != 0 { AMB_IN } else { AMB_OUT };
        let aoff = if b.flags & F_ACID != 0 { ACID } else { 0 };
        if camz > b.zt {
            let ytn = hor - (b.zt - camz) * proj * inv_nr;
            let ytf = hor - (b.zt - camz) * proj * inv_far;
            let ya = imax(0, f32_ceil(ytf) as i32);
            let yb = if own { rh } else { imin(rh, f32_ceil(ytn) as i32) };
            let hgt = (camz - b.zt) * proj;
            let (x0, x1, y0, y1) = (b.gx, b.gx + b.gw, b.gy, b.gy + b.gh);
            let rim = b.flags & F_RIM != 0;
            let pad = b.flags & F_PAD != 0;
            let tb = tex * NL;
            for y in ya..yb {
                let i = col + y as usize;
                if rd!(NRM[i]) != EMPTY { continue; }
                filled += 1;
                let d = hgt * rd!(RINV[y as usize]);
                let wx = px + rdx * d;
                let wy = py + rdy * d;
                let l = lvlf(d);
                if rim && (wx - x0 < 0.05 || x1 - wx < 0.05 || wy - y0 < 0.05 || y1 - wy < 0.05) {
                    put(i, rd!(RIM[tb + l]), d, wx, wy, b.zt, 0, a0);
                    wr!(GBUF[i] = rd!(RIMG[tb + l]));
                } else {
                    let k = (((((wy * tf) as i32) + (aoff >> 1)) & TM) * T + ((((wx * tf) as i32) + aoff) & TM)) as usize;
                    let a = if b.ao != 0 { a0 * ao_floor(b.ao, wx, wy) } else { a0 };
                    put(i, rd!(TEXLV[(tb + l) * TT + k]), d, wx, wy, b.zt, 0, a);
                    if rd!(TEXEM[tex * TT + k]) != 0 { wr!(GBUF[i] = rd!(TEXGL[tex * TT + k])); } else if pad { wr!(GBUF[i] = PADG); }
                }
            }
        }
        if camz < b.zb {
            let ybn = hor - (b.zb - camz) * proj * inv_nr;
            let ybf = hor - (b.zb - camz) * proj * inv_far;
            let ya = if own { 0 } else { imax(0, f32_ceil(ybn) as i32) };
            let yb = imin(rh, f32_ceil(ybf) as i32);
            let hgt = (b.zb - camz) * proj;
            let cxp = b.gx + b.gw / 2.0;
            let cyp = b.gy + b.gh / 2.0;
            let is_plat = b.flags & F_SHIP == 0;
            let tb = tex * NL;
            for y in ya..yb {
                let i = col + y as usize;
                if rd!(NRM[i]) != EMPTY { continue; }
                filled += 1;
                let d = -hgt * rd!(RINV[y as usize]);
                let wx = px + rdx * d;
                let wy = py + rdy * d;
                let k = (((((wy * tf) as i32) & TM) * T) + (((wx * tf) as i32) & TM)) as usize;
                if is_plat {
                    let dx = wx - cxp;
                    let dy = wy - cyp;
                    let r2 = dx * dx + dy * dy;
                    if r2 < 0.1024 {
                        let q = 1.0 - f32_sqrt(r2) * (1.0 / 0.32);
                        put(i, pack(255.0, 150.0 + 90.0 * q, 60.0 + 150.0 * q), d, wx, wy, b.zb, 1, a0);
                        wr!(GBUF[i] = pack(255.0 * q, 120.0 * q, 30.0 * q));
                    } else {
                        let l = { let l = lvlf(d) + 6; if l > NL - 1 { NL - 1 } else { l } };
                        put(i, rd!(TEXLV[(tb + l) * TT + k]), d, wx, wy, b.zb, 1, a0);
                    }
                } else {
                    let l = { let l = lvlf(d) + 1; if l > NL - 1 { NL - 1 } else { l } };
                    let a = if b.ao != 0 { a0 * ao_floor(b.ao, wx, wy) } else { a0 };
                    put(i, rd!(TEXLV[(tb + l) * TT + k]), d, wx, wy, b.zb, 1, a);
                    if rd!(TEXEM[tex * TT + k]) != 0 { wr!(GBUF[i] = rd!(TEXGL[tex * TT + k])); }
                }
            }
        }
    }
    filled
}

#[no_mangle]
pub unsafe extern "C" fn render(px: f32, py: f32, camz: f32, dirx: f32, diry: f32, plx: f32, ply: f32, pa: f32, hor: f32,
                                rw: i32, rh: i32, acid: i32, maxd: f32, pl: f32, cx0: i32, cx1: i32) {
    let rw = imax(1, imin(rw, 800));
    let rh = imax(1, imin(rh, 500));
    let cx0 = imax(0, imin(cx0, rw));
    let cx1 = imax(cx0, imin(cx1, rw));
    RW = rw; RH = rh; CPX = px; CPY = py; CAMZ = camz; HOR = hor; ACID = acid;
    PROJ = rw as f32 / 2.0 / pl;
    let (i0, i1) = ((cx0 * rh) as usize, (cx1 * rh) as usize);
    core::ptr::write_bytes(NRM.as_mut_ptr().add(i0), EMPTY, i1 - i0);
    let gb = GBUF.as_mut_ptr();
    for i in i0..i1 { *gb.add(i) = BLACK; }
    let inv_proj = 1.0 / PROJ;
    for y in 0..rh {
        let v = y as f32 + 0.5 - hor;
        RINV[y as usize] = if fabs(v) < 1e-3 { if v < 0.0 { -1e3 } else { 1e3 } } else { 1.0 / v };
        ROWX[y as usize] = 0.0; ROWY[y as usize] = 0.0; ROWZ[y as usize] = (hor - y as f32) * inv_proj;
    }
    FLATD = -0.5 * inv_proj;
    let _ = pa;
    for x in cx0..cx1 {
        let col = (x * rh) as usize;
        let cx = 2.0 * (x as f32 + 0.5) / rw as f32 - 1.0;
        let rdx = dirx + plx * cx;
        let rdy = diry + ply * cx;
        COLX[x as usize] = rdx; COLY[x as usize] = rdy; COLZ[x as usize] = 0.0;
        let mut mapx = f32_floor(px) as i32;
        let mut mapy = f32_floor(py) as i32;
        let ddx = if rdx != 0.0 { fabs(1.0 / rdx) } else { 1e30 };
        let ddy = if rdy != 0.0 { fabs(1.0 / rdy) } else { 1e30 };
        let (stx, mut sdx) = if rdx < 0.0 { (-1, (px - mapx as f32) * ddx) } else { (1, (mapx as f32 + 1.0 - px) * ddx) };
        let (sty, mut sdy) = if rdy < 0.0 { (-1, (py - mapy as f32) * ddy) } else { (1, (mapy as f32 + 1.0 - py) * ddy) };
        let mut filled = 0;
        let mut side = 0;
        let mut dcur = 0.0f32;
        for s in 0..90 {
            let dnext = fmin(sdx, sdy);
            if mapx >= 0 && mapy >= 0 && mapx < MW && mapy < MH {
                let h = rd!(HEAD[(mapy * MW + mapx) as usize]);
                if h != 0 {
                    filled += draw_cell(x, h, dcur, dnext, side, rdx, rdy, s == 0);
                    if filled >= rh { break; }
                }
            }
            if dnext > maxd { break; }
            dcur = dnext;
            if sdx < sdy { sdx += ddx; mapx += stx; side = 0; } else { sdy += ddy; mapy += sty; side = 1; }
        }
        if filled < rh {
            let rxy = f32_sqrt(rdx * rdx + rdy * rdy);
            let mut u = atan2f(rdy, rdx) * (1.0 / TAU);
            u -= f32_floor(u);
            let sx = imax(0, imin((u * SKW as f32) as i32, SKW - 1));
            for y in 0..rh {
                let i = col + y as usize;
                if rd!(NRM[i]) != EMPTY { continue; }
                let v = 0.5 - atan2f((hor - y as f32 - 0.5) * inv_proj, rxy) * (1.0 / PI);
                let sy = imax(0, imin((v * SKH as f32) as i32, SKH - 1));
                wr!(BUF[i] = rd!(SKY[(sy * SKW + sx) as usize]));
                wr!(DEPTH[i] = 1e9);
                wr!(AMB[i] = -1.0);
                wr!(NRM[i] = SKYN);
            }
        }
    }
}

// ======================= render 3D por píxel =======================
unsafe fn shade_hit(i: usize, b: &Block, kind: u8, side: i32, t: f32, hx: f32, hy: f32, hz: f32, dx: f32, dy: f32) {
    let tf = T as f32;
    let tex = b.tex as usize;
    let a0 = if b.flags & F_SHIP != 0 { AMB_IN } else { AMB_OUT };
    let d = fmax(t, 0.02);
    if kind == 1 {
        let u = if side == 0 { hy } else { hx };
        let tx = imin(((u - f32_floor(u)) * tf) as i32, TM);
        let l0 = lvlf(d);
        let li = { let l = l0 + 1 + (side as usize) * 2; if l > NL - 1 { NL - 1 } else { l } };
        let nrm: u8 = if side == 0 { if dx > 0.0 { 3 } else { 2 } } else if dy > 0.0 { 5 } else { 4 };
        let th = b.zt - b.zb;
        let zz = b.zt - hz;
        let rim = b.flags & F_RIM != 0;
        if rim && zz < 0.045 {
            put(i, rd!(RIM[tex * NL + l0]), d, hx, hy, hz, nrm, a0);
            wr!(GBUF[i] = rd!(RIMG[tex * NL + l0]));
        } else if rim && th - zz < 0.03 {
            put(i, DARK, d, hx, hy, hz, nrm, a0);
        } else {
            let mut a = a0;
            if b.flags & F_SHIP != 0 {
                let up = th - zz;
                if up < 0.45 { a *= 0.35 + 0.65 * up * (1.0 / 0.45); }
                if zz < 0.3 { a *= 0.55 + 0.45 * zz * (1.0 / 0.3); }
            }
            let k = (((((-hz * tf) as i32) & TM) * T) + tx) as usize;
            put(i, rd!(TEXLV[(tex * NL + li) * TT + k]), d, hx, hy, hz, nrm, a);
            if rd!(TEXEM[tex * TT + k]) != 0 { wr!(GBUF[i] = rd!(TEXGL[tex * TT + k])); }
        }
    } else if kind == 2 {
        let l = lvlf(d);
        let tb = tex * NL;
        let (x0, x1, y0, y1) = (b.gx, b.gx + b.gw, b.gy, b.gy + b.gh);
        if b.flags & F_RIM != 0 && (hx - x0 < 0.05 || x1 - hx < 0.05 || hy - y0 < 0.05 || y1 - hy < 0.05) {
            put(i, rd!(RIM[tb + l]), d, hx, hy, b.zt, 0, a0);
            wr!(GBUF[i] = rd!(RIMG[tb + l]));
        } else {
            let aoff = if b.flags & F_ACID != 0 { ACID } else { 0 };
            let k = (((((hy * tf) as i32) + (aoff >> 1)) & TM) * T + ((((hx * tf) as i32) + aoff) & TM)) as usize;
            let a = if b.ao != 0 { a0 * ao_floor(b.ao, hx, hy) } else { a0 };
            put(i, rd!(TEXLV[(tb + l) * TT + k]), d, hx, hy, b.zt, 0, a);
            if rd!(TEXEM[tex * TT + k]) != 0 { wr!(GBUF[i] = rd!(TEXGL[tex * TT + k])); } else if b.flags & F_PAD != 0 { wr!(GBUF[i] = PADG); }
        }
    } else {
        let tb = tex * NL;
        let k = (((((hy * tf) as i32) & TM) * T) + (((hx * tf) as i32) & TM)) as usize;
        if b.flags & F_SHIP == 0 {
            let (ddx, ddy) = (hx - (b.gx + b.gw / 2.0), hy - (b.gy + b.gh / 2.0));
            let r2 = ddx * ddx + ddy * ddy;
            if r2 < 0.1024 {
                let q = 1.0 - f32_sqrt(r2) * (1.0 / 0.32);
                put(i, pack(255.0, 150.0 + 90.0 * q, 60.0 + 150.0 * q), d, hx, hy, b.zb, 1, a0);
                wr!(GBUF[i] = pack(255.0 * q, 120.0 * q, 30.0 * q));
            } else {
                let l = { let l = lvlf(d) + 6; if l > NL - 1 { NL - 1 } else { l } };
                put(i, rd!(TEXLV[(tb + l) * TT + k]), d, hx, hy, b.zb, 1, a0);
            }
        } else {
            let l = { let l = lvlf(d) + 1; if l > NL - 1 { NL - 1 } else { l } };
            let a = if b.ao != 0 { a0 * ao_floor(b.ao, hx, hy) } else { a0 };
            put(i, rd!(TEXLV[(tb + l) * TT + k]), d, hx, hy, b.zb, 1, a);
            if rd!(TEXEM[tex * TT + k]) != 0 { wr!(GBUF[i] = rd!(TEXGL[tex * TT + k])); }
        }
    }
}

struct Cam3 { px: f32, py: f32, camz: f32, mx0: i32, my0: i32, fxl: f32, fxh: f32, fyl: f32, fyh: f32, maxd: f32, zmin: f32, zmax: f32 }

#[derive(Clone, Copy)]
struct Hit { bb: u32, kind: u8, side: i8, t: f32, p: f32 }
const SKYHIT: Hit = Hit { bb: 0, kind: 0, side: 0, t: 0.0, p: 0.0 };

unsafe fn trace3d(c: &Cam3, dx: f32, dy: f32, dz: f32, ddx: f32, ddy: f32, inv_dz: f32) -> Hit {
    let camz = c.camz;
    if (dz > 0.0 && camz > c.zmax) || (dz < 0.0 && camz < c.zmin) { return SKYHIT; }
    let (mut mapx, mut mapy) = (c.mx0, c.my0);
    let (stx, mut sdx) = if dx < 0.0 { (-1, c.fxl * ddx) } else { (1, c.fxh * ddx) };
    let (sty, mut sdy) = if dy < 0.0 { (-1, c.fyl * ddy) } else { (1, c.fyh * ddy) };
    let mut t0 = 0.0f32;
    let mut side = -1i32;
    for _ in 0..200 {
        let t1 = fmin(sdx, sdy);
        if (mapx as u32) < MW as u32 && (mapy as u32) < MH as u32 {
            let ci = (mapy * MW + mapx) as usize;
            let mut bi = rd!(HEAD[ci]);
            if bi != 0 {
                let za = camz + dz * t0;
                let zb = camz + dz * t1;
                let (lo, hi) = if za < zb { (za, zb) } else { (zb, za) };
                let cz = CZ.get_unchecked(ci);
                if hi >= cz[0] && lo <= cz[1] {
                    let (mut bt, mut bk, mut bb) = (1e30f32, 0u8, 0u32);
                    while bi != 0 {
                        let b = BL.get_unchecked((bi - 1) as usize);
                        if b.zb > hi { break; }
                        if b.zt >= lo {
                            if side >= 0 && za >= b.zb && za <= b.zt {
                                if t0 < bt { bt = t0; bk = 1; bb = bi; }
                            } else if dz < 0.0 && za > b.zt && zb <= b.zt {
                                let t = (b.zt - camz) * inv_dz;
                                if t < bt { bt = t; bk = 2; bb = bi; }
                            } else if dz > 0.0 && za < b.zb && zb >= b.zb {
                                let t = (b.zb - camz) * inv_dz;
                                if t < bt { bt = t; bk = 3; bb = bi; }
                            }
                        }
                        bi = b.next;
                    }
                    if bk != 0 {
                        let p = if bk == 1 { f32_floor(if side == 0 { c.px + dx * bt } else { c.py + dy * bt } + 0.5) } else { 0.0 };
                        return Hit { bb, kind: bk, side: side as i8, t: bt, p };
                    }
                }
            }
        }
        if t1 > c.maxd { break; }
        let z1 = camz + dz * t1;
        if (dz > 0.0 && z1 > c.zmax) || (dz < 0.0 && z1 < c.zmin) { break; }
        t0 = t1;
        if sdx < sdy { sdx += ddx; mapx += stx; side = 0; } else { sdy += ddy; mapy += sty; side = 1; }
    }
    SKYHIT
}

unsafe fn shade3d(i: usize, c: &Cam3, h: Hit, dx: f32, dy: f32, dz: f32) {
    if h.bb == 0 {
        wr!(BUF[i] = sky_dir(dx, dy, dz));
        wr!(DEPTH[i] = 1e9);
        wr!(AMB[i] = -1.0);
        wr!(NRM[i] = SKYN);
    } else {
        let b = BL.get_unchecked((h.bb - 1) as usize);
        shade_hit(i, b, h.kind, h.side as i32, h.t, c.px + dx * h.t, c.py + dy * h.t, c.camz + dz * h.t, dx, dy);
    }
}

#[inline(always)]
fn inv3(dx: f32, dy: f32, dz: f32) -> (f32, f32, f32) {
    (if dx != 0.0 { fmin(fabs(1.0 / dx), 1e30) } else { 1e30 }, if dy != 0.0 { fmin(fabs(1.0 / dy), 1e30) } else { 1e30 }, if dz != 0.0 { 1.0 / dz } else { 0.0 })
}

#[inline(always)]
fn same_face(a: &Hit, b: &Hit) -> bool { a.bb == b.bb && a.kind == b.kind && a.side == b.side }

#[inline(always)]
unsafe fn ray_dir(x: usize, y: usize) -> (f32, f32, f32) {
    (rd!(COLX[x]) + rd!(ROWX[y]), rd!(COLY[x]) + rd!(ROWY[y]), rd!(COLZ[x]) + rd!(ROWZ[y]))
}

unsafe fn trace_px(c: &Cam3, x: usize, y: usize) -> Hit {
    let (dx, dy, dz) = ray_dir(x, y);
    let (ddx, ddy, idz) = inv3(dx, dy, dz);
    trace3d(c, dx, dy, dz, ddx, ddy, idz)
}

unsafe fn resolve_px(c: &Cam3, h: &Hit, x: usize, y: usize, rhu: usize) {
    let (dx, dy, dz) = ray_dir(x, y);
    let i = x * rhu + y;
    if h.bb == 0 { shade3d(i, c, SKYHIT, dx, dy, dz); return; }
    let b = BL.get_unchecked((h.bb - 1) as usize);
    let t = match h.kind {
        2 => if dz < 0.0 { (b.zt - c.camz) / dz } else { -1.0 },
        3 => if dz > 0.0 { (b.zb - c.camz) / dz } else { -1.0 },
        _ => if h.side == 0 { if dx != 0.0 { (h.p - c.px) / dx } else { -1.0 } } else if dy != 0.0 { (h.p - c.py) / dy } else { -1.0 },
    };
    if t > 0.0 && t < c.maxd * 1.5 { shade3d(i, c, Hit { t, ..*h }, dx, dy, dz); } else { let hh = trace_px(c, x, y); shade3d(i, c, hh, dx, dy, dz); }
}

unsafe fn trace_shade(c: &Cam3, x: usize, y: usize, rhu: usize) -> Hit {
    let (dx, dy, dz) = ray_dir(x, y);
    let (ddx, ddy, idz) = inv3(dx, dy, dz);
    let h = trace3d(c, dx, dy, dz, ddx, ddy, idz);
    shade3d(x * rhu + y, c, h, dx, dy, dz);
    h
}

const G4MAX: usize = 201 * 126;
static mut G4: [Hit; G4MAX] = [SKYHIT; G4MAX];

#[no_mangle]
pub unsafe extern "C" fn render3d(px: f32, py: f32, camz: f32, fx: f32, fy: f32, fz: f32, rx: f32, ry: f32,
                                  ux: f32, uy: f32, uz: f32, rw: i32, rh: i32, acid: i32, maxd: f32, pl: f32, cx0: i32, cx1: i32) {
    let rw = imax(4, imin(rw, 800)) & !3;
    let rh = imax(4, imin(rh, 500)) & !3;
    let cx0 = imax(0, imin(cx0, rw)) & !3;
    let cx1 = imax(cx0, imin(cx1, rw)) & !3;
    RW = rw; RH = rh; CPX = px; CPY = py; CAMZ = camz; ACID = acid;
    let proj = rw as f32 / 2.0 / pl;
    PROJ = proj; HOR = rh as f32 / 2.0;
    let gb = GBUF.as_mut_ptr();
    for i in (cx0 * rh) as usize..(cx1 * rh) as usize { *gb.add(i) = BLACK; }
    let inv_proj = 1.0 / proj;
    for y in 0..=rh {
        let v = (rh as f32 * 0.5 - y as f32 - 0.5) * inv_proj;
        ROWX[y as usize] = ux * v; ROWY[y as usize] = uy * v; ROWZ[y as usize] = uz * v;
    }
    for x in 0..=rw {
        let cx = (2.0 * (x as f32 + 0.5) / rw as f32 - 1.0) * pl;
        COLX[x as usize] = fx + rx * cx; COLY[x as usize] = fy + ry * cx; COLZ[x as usize] = fz;
    }
    FLATD = 0.0;
    let (mx0, my0) = (f32_floor(px) as i32, f32_floor(py) as i32);
    let c = Cam3 { px, py, camz, mx0, my0, fxl: px - mx0 as f32, fxh: mx0 as f32 + 1.0 - px, fyl: py - my0 as f32, fyh: my0 as f32 + 1.0 - py,
                   maxd, zmin: ZMIN, zmax: ZMAX };
    let (rhu, xa, xb) = (rh as usize, cx0 as usize, cx1 as usize);
    let (ga, gb4, gh) = (xa / 4, xb / 4, rhu / 4);
    let gs = gh + 1;
    for i in ga..=gb4 {
        for j in 0..=gh {
            let (x, y) = (i * 4, j * 4);
            let h = if x < xb && y < rhu { trace_shade(&c, x, y, rhu) } else { trace_px(&c, x, y) };
            wr!(G4[i * gs + j] = h);
        }
    }
    for i in ga..gb4 {
        for j in 0..gh {
            let h00 = rd!(G4[i * gs + j]);
            let (h10, h01, h11) = (rd!(G4[(i + 1) * gs + j]), rd!(G4[i * gs + j + 1]), rd!(G4[(i + 1) * gs + j + 1]));
            let (x0, y0) = (i * 4, j * 4);
            if same_face(&h00, &h10) && same_face(&h00, &h01) && same_face(&h00, &h11) {
                for dx in 0..4 { for dy in 0..4 { if dx + dy > 0 { resolve_px(&c, &h00, x0 + dx, y0 + dy, rhu); } } }
                continue;
            }
            let mut s = [SKYHIT; 9];
            s[0] = h00; s[2] = h10; s[6] = h01; s[8] = h11;
            for (k, ox, oy) in [(1usize, 2usize, 0usize), (3, 0, 2), (4, 2, 2), (5, 4, 2), (7, 2, 4)] {
                let (x, y) = (x0 + ox, y0 + oy);
                s[k] = if ox < 4 && oy < 4 { trace_shade(&c, x, y, rhu) } else { trace_px(&c, x, y) };
            }
            for (a, b) in [(0usize, 0usize), (1, 0), (0, 1), (1, 1)] {
                let (q00, q10, q01, q11) = (s[b * 3 + a], s[b * 3 + a + 1], s[(b + 1) * 3 + a], s[(b + 1) * 3 + a + 1]);
                let (sx, sy) = (x0 + a * 2, y0 + b * 2);
                if same_face(&q00, &q10) && same_face(&q00, &q01) && same_face(&q00, &q11) {
                    for (ddx, ddy) in [(1usize, 0usize), (0, 1), (1, 1)] { resolve_px(&c, &q00, sx + ddx, sy + ddy, rhu); }
                } else {
                    for (ddx, ddy) in [(1usize, 0usize), (0, 1), (1, 1)] { trace_shade(&c, sx + ddx, sy + ddy, rhu); }
                }
            }
        }
    }
}

// ======================= iluminación (diferida, por tiles, SIMD) =======================
use core::arch::wasm32::f32_sqrt;

#[cfg(not(target_feature = "simd128"))]
#[inline(always)]
#[allow(dead_code)]
fn mask4(b: [bool; 4]) -> v128 {
    u32x4(if b[0] { !0 } else { 0 }, if b[1] { !0 } else { 0 }, if b[2] { !0 } else { 0 }, if b[3] { !0 } else { 0 })
}

#[cfg(not(target_feature = "simd128"))]
include!("scalar4.rs");

pub(crate) static mut OUT: [u32; MAXP] = [0; MAXP];
static mut OUTX0: i32 = 0;
static mut OUTW: i32 = 1;
#[no_mangle] pub unsafe extern "C" fn p_out() -> *mut u32 { OUT.as_mut_ptr() }

const TS: i32 = 16;
const LSOFT: f32 = 0.34;
const JIT: [[f32; 3]; 4] = [[0.72, 0.72, 0.3], [-0.72, 0.72, -0.3], [0.72, -0.72, -0.3], [-0.72, -0.72, 0.3]];
static mut TLIST: [usize; MAXL] = [0; MAXL];
static mut SLIST: [usize; MAXS] = [0; MAXS];

#[inline(always)]
fn coherent(n: &[u8; 4], x: &[f32; 4], y: &[f32; 4], z: &[f32; 4], a: usize, b: usize) -> bool {
    n[a] == n[b] && fabs(x[a] - x[b]) + fabs(y[a] - y[b]) + fabs(z[a] - z[b]) < 0.35
}

#[inline(always)]
fn ray_origin(n: u8, qx: f32, qy: f32, qz: f32, lx: f32, ly: f32, lz: f32) -> (f32, f32, f32) {
    match n {
        0 => (qx, qy, qz + 0.03),
        1 => (qx, qy, qz - 0.03),
        2 => (qx + 0.03, qy, qz),
        3 => (qx - 0.03, qy, qz),
        4 => (qx, qy + 0.03, qz),
        5 => (qx, qy - 0.03, qz),
        _ => {
            let (dx, dy, dz) = (lx - qx, ly - qy, lz - qz);
            let inv = 0.15 / f32_sqrt(dx * dx + dy * dy + dz * dz + 1e-4);
            (qx + dx * inv, qy + dy * inv, qz + dz * inv)
        }
    }
}

#[inline(always)]
unsafe fn ld4<T>(a: *const T, i: usize, j: usize) -> v128 {
    let lo = core::ptr::read_unaligned(a.add(i) as *const u64);
    let hi = core::ptr::read_unaligned(a.add(j) as *const u64);
    u64x2(lo, hi)
}
#[inline(always)]
fn lanes(v: v128) -> [f32; 4] { unsafe { core::mem::transmute(v) } }
#[inline(always)]
fn from_lanes(a: [f32; 4]) -> v128 { unsafe { core::mem::transmute(a) } }
#[inline(always)]
fn sp(v: f32) -> v128 { f32x4_splat(v) }


unsafe fn store_quad(c: v128, x: i32, y: i32) {
    let r = i32x4_shuffle::<0, 2, 1, 3>(c, c);
    let o = OUT.as_mut_ptr();
    let (w, x) = (OUTW, x - OUTX0);
    core::ptr::write_unaligned(o.add((y * w + x) as usize) as *mut u64, u64x2_extract_lane::<0>(r));
    core::ptr::write_unaligned(o.add(((y + 1) * w + x) as usize) as *mut u64, u64x2_extract_lane::<1>(r));
}

#[no_mangle]
pub unsafe extern "C" fn light_pass(rw: i32, rh: i32, nl: i32, ns: i32, lamp: i32, rt: i32, cx0: i32, cx1: i32, rtmax: f32) -> i32 {
    let (px, py, camz) = (CPX, CPY, CAMZ);
    let flatd = FLATD;
    let rw = imax(2, imin(rw, 800)) & !1;
    let rh = imax(2, imin(rh, 500)) & !1;
    let cx0 = imax(0, imin(cx0, rw)) & !15;
    let cx1 = imax(cx0, imin(cx1, rw));
    OUTX0 = cx0; OUTW = cx1 - cx0;
    let vrt = sp(rtmax);
    let nl = imax(0, imin(nl, MAXL as i32)) as usize;
    let ns = imax(0, imin(ns, MAXS as i32)) as usize;
    let rhu = rh as usize;
    let (ambp, depp, bufp, gbp, nrmp) = (AMB.as_ptr(), DEPTH.as_ptr(), BUF.as_ptr(), GBUF.as_ptr(), NRM.as_ptr());
    let one = sp(1.0);
    let zero = sp(0.0);
    let cone_cx = rw as f32 * 0.5;
    let cone_cy = rh as f32 * 0.52;
    let cone_k = 2.0 / rw as f32;
    let mut rays = 0i32;
    let mut tx0 = cx0;
    while tx0 < cx1 {
        let tx1 = imin(tx0 + TS, cx1);
        let mut ty0 = 0;
        while ty0 < rh {
            let ty1 = imin(ty0 + TS, rh);
            let (mut vx0, mut vy0, mut vz0) = (sp(1e30), sp(1e30), sp(1e30));
            let (mut vx1, mut vy1, mut vz1) = (sp(-1e30), sp(-1e30), sp(-1e30));
            let mut von = u32x4_splat(0);
            let mut dmax_all = sp(0.0);
            for x in tx0..tx1 {
                let col = (x * rh) as usize;
                let (cxv, cyv, czv) = (sp(rd!(COLX[x as usize])), sp(rd!(COLY[x as usize])), sp(rd!(COLZ[x as usize])));
                let mut y = ty0;
                while y < ty1 {
                    let i = col + y as usize;
                    let yu = y as usize;
                    let a = v128_load(ambp.add(i) as *const v128);
                    let g = v128_load(gbp.add(i) as *const v128);
                    let on = v128_and(f32x4_ge(a, zero), i32x4_eq(g, u32x4_splat(BLACK)));
                    if v128_any_true(on) {
                        let d = v128_load(depp.add(i) as *const v128);
                        let qx = f32x4_add(sp(px), f32x4_mul(f32x4_add(cxv, v128_load(ROWX.as_ptr().add(yu) as *const v128)), d));
                        let qy = f32x4_add(sp(py), f32x4_mul(f32x4_add(cyv, v128_load(ROWY.as_ptr().add(yu) as *const v128)), d));
                        let qz = f32x4_add(sp(camz), f32x4_mul(f32x4_add(czv, v128_load(ROWZ.as_ptr().add(yu) as *const v128)), d));
                        vx0 = f32x4_pmin(vx0, v128_bitselect(qx, sp(1e30), on)); vx1 = f32x4_pmax(vx1, v128_bitselect(qx, sp(-1e30), on));
                        vy0 = f32x4_pmin(vy0, v128_bitselect(qy, sp(1e30), on)); vy1 = f32x4_pmax(vy1, v128_bitselect(qy, sp(-1e30), on));
                        vz0 = f32x4_pmin(vz0, v128_bitselect(qz, sp(1e30), on)); vz1 = f32x4_pmax(vz1, v128_bitselect(qz, sp(-1e30), on));
                        dmax_all = f32x4_pmax(dmax_all, v128_and(d, on));
                        von = v128_or(von, on);
                    }
                    y += 4;
                }
            }
            let any = v128_any_true(von);
            let hmin = |v: v128| { let l = lanes(v); fmin(fmin(l[0], l[1]), fmin(l[2], l[3])) };
            let hmax = |v: v128| { let l = lanes(v); fmax(fmax(l[0], l[1]), fmax(l[2], l[3])) };
            let zm = fabs(flatd) * hmax(dmax_all) + 0.01;
            let (x0, y0, z0) = (hmin(vx0), hmin(vy0), hmin(vz0) - zm);
            let (x1, y1, z1) = (hmax(vx1), hmax(vy1), hmax(vz1) + zm);
            if !any {
                for x in tx0..tx1 { let col = (x * rh) as usize; for y in ty0..ty1 { wr!(OUT[(y * OUTW + x - OUTX0) as usize] = rd!(BUF[col + y as usize])); } }
                ty0 += TS;
                continue;
            }
            let mut nt = 0usize;
            for li in 0..nl {
                let o = li * 8;
                let (lx, ly, lz, rad, int) = (LIGHTS[o], LIGHTS[o + 1], LIGHTS[o + 2], LIGHTS[o + 6], LIGHTS[o + 7]);
                if int <= 0.0 || rad <= 0.0 { continue; }
                let dx = fmax(fmax(x0 - lx, lx - x1), 0.0);
                let dy = fmax(fmax(y0 - ly, ly - y1), 0.0);
                let dz = fmax(fmax(z0 - lz, lz - z1), 0.0);
                if dx * dx + dy * dy + dz * dz < rad * rad { TLIST[nt] = li; nt += 1; }
            }
            let mut nsh = 0usize;
            for s in 0..ns {
                let o = s * 5;
                let (sx, sy, sz, rad) = (SHAD[o], SHAD[o + 1], SHAD[o + 2], SHAD[o + 3]);
                if rad <= 0.0 || sz < z0 - 0.1 || sz > z1 + 0.1 { continue; }
                let dx = fmax(fmax(x0 - sx, sx - x1), 0.0);
                let dy = fmax(fmax(y0 - sy, sy - y1), 0.0);
                if dx * dx + dy * dy < rad * rad { SLIST[nsh] = s; nsh += 1; }
            }
            let mut x = tx0;
            while x < tx1 {
                let xu = x as usize;
                let (c0x, c0y, c0z, c1x, c1y, c1z) = (rd!(COLX[xu]), rd!(COLY[xu]), rd!(COLZ[xu]), rd!(COLX[xu + 1]), rd!(COLY[xu + 1]), rd!(COLZ[xu + 1]));
                let vcolx = f32x4(c0x, c0x, c1x, c1x);
                let vcoly = f32x4(c0y, c0y, c1y, c1y);
                let vcolz = f32x4(c0z, c0z, c1z, c1z);
                let vcx = f32x4_mul(f32x4_sub(f32x4(x as f32, x as f32, x as f32 + 1.0, x as f32 + 1.0), sp(cone_cx)), sp(cone_k));
                let mut y = ty0;
                while y < ty1 {
                    let i0 = (x * rh + y) as usize;
                    let i2 = i0 + rhu;
                    let cbuf = ld4(bufp, i0, i2);
                    let a = ld4(ambp, i0, i2);
                    let on = v128_and(f32x4_ge(a, zero), i32x4_eq(ld4(gbp, i0, i2), u32x4_splat(BLACK)));
                    if !v128_any_true(on) { store_quad(cbuf, x, y); y += 2; continue; }
                    let n01 = core::ptr::read_unaligned(nrmp.add(i0) as *const u16) as u32;
                    let n23 = core::ptr::read_unaligned(nrmp.add(i2) as *const u16) as u32;
                    let nvec = u32x4(n01 & 255, n01 >> 8, n23 & 255, n23 >> 8);
                    let eq = |k: u32| i32x4_eq(nvec, u32x4_splat(k));
                    let d = ld4(depp, i0, i2);
                    let flat = u32x4_le(nvec, u32x4_splat(1));
                    let yu = y as usize;
                    let (r0x, r0y, r0z, r1x, r1y, r1z) = (rd!(ROWX[yu]), rd!(ROWY[yu]), rd!(ROWZ[yu]), rd!(ROWX[yu + 1]), rd!(ROWY[yu + 1]), rd!(ROWZ[yu + 1]));
                    let rayx = f32x4_add(vcolx, f32x4(r0x, r1x, r0x, r1x));
                    let rayy = f32x4_add(vcoly, f32x4(r0y, r1y, r0y, r1y));
                    let rayz = f32x4_add(f32x4_add(vcolz, f32x4(r0z, r1z, r0z, r1z)), v128_and(sp(flatd), flat));
                    let qx = f32x4_add(sp(px), f32x4_mul(rayx, d));
                    let qy = f32x4_add(sp(py), f32x4_mul(rayy, d));
                    let qz = f32x4_add(sp(camz), f32x4_mul(rayz, d));
                    let mut cr = f32x4_mul(a, sp(0.9));
                    let mut cg = f32x4_mul(a, sp(0.95));
                    let mut cb = f32x4_mul(a, sp(1.1));
                    let vcy = f32x4_mul(f32x4_sub(f32x4(y as f32, y as f32 + 1.0, y as f32, y as f32 + 1.0), sp(cone_cy)), sp(cone_k));
                    let rr = f32x4_add(f32x4_mul(vcx, vcx), f32x4_mul(vcy, vcy));
                    if lamp != 0 && v128_any_true(f32x4_lt(rr, sp(0.66 * 0.66))) {
                        let r = f32x4_sqrt(rr);
                        let c = f32x4_pmin(one, f32x4_pmax(zero, f32x4_sub(one, f32x4_mul(f32x4_sub(r, sp(0.16)), sp(2.0)))));
                        let cf = f32x4_mul(c, c);
                        let f = f32x4_div(f32x4_mul(cf, sp(1.1)), f32x4_add(one, f32x4_mul(f32x4_mul(d, d), sp(0.025))));
                        cr = f32x4_add(cr, f); cg = f32x4_add(cg, f32x4_mul(f, sp(0.93))); cb = f32x4_add(cb, f32x4_mul(f, sp(0.8)));
                    }
                    let e0 = eq(0);
                    let nx = f32x4_sub(v128_and(one, eq(2)), v128_and(one, eq(3)));
                    let ny = f32x4_sub(v128_and(one, eq(4)), v128_and(one, eq(5)));
                    let nz = f32x4_sub(v128_and(one, e0), v128_and(one, eq(1)));
                    let spr = u32x4_ge(nvec, u32x4_splat(6));
                    if nsh > 0 {
                        let floor = v128_and(on, e0);
                        if v128_any_true(floor) {
                            for k in 0..nsh {
                                let o = rd!(SLIST[k]) * 5;
                                let (sx, sy, sz, rad, kk) = (SHAD[o], SHAD[o + 1], SHAD[o + 2], SHAD[o + 3], SHAD[o + 4]);
                                let near = f32x4_le(f32x4_abs(f32x4_sub(qz, sp(sz))), sp(0.08));
                                let dx = f32x4_sub(qx, sp(sx));
                                let dy = f32x4_sub(qy, sp(sy));
                                let d2 = f32x4_add(f32x4_mul(dx, dx), f32x4_mul(dy, dy));
                                let r2 = rad * rad;
                                let hit = v128_and(v128_and(floor, near), f32x4_lt(d2, sp(r2)));
                                if !v128_any_true(hit) { continue; }
                                let m = f32x4_sub(one, f32x4_mul(sp(kk), f32x4_sub(one, f32x4_mul(d2, sp(1.0 / r2)))));
                                let m = v128_bitselect(m, one, hit);
                                cr = f32x4_mul(cr, m); cg = f32x4_mul(cg, m); cb = f32x4_mul(cb, m);
                            }
                        }
                    }
                    for t in 0..nt {
                        let li = rd!(TLIST[t]);
                        let o = li * 8;
                        let (lx, ly, lz, lr, lg, lb, rad, int) = (LIGHTS[o], LIGHTS[o + 1], LIGHTS[o + 2], LIGHTS[o + 3], LIGHTS[o + 4], LIGHTS[o + 5], LIGHTS[o + 6], LIGHTS[o + 7]);
                        let r2 = rad * rad;
                        let dx = f32x4_sub(sp(lx), qx);
                        let dy = f32x4_sub(sp(ly), qy);
                        let dz = f32x4_sub(sp(lz), qz);
                        let d2 = f32x4_add(f32x4_add(f32x4_mul(dx, dx), f32x4_mul(dy, dy)), f32x4_mul(dz, dz));
                        let comp = f32x4_add(f32x4_add(f32x4_mul(dx, nx), f32x4_mul(dy, ny)), f32x4_mul(dz, nz));
                        let ok = v128_and(v128_and(on, f32x4_lt(d2, sp(r2))), v128_or(spr, f32x4_gt(comp, zero)));
                        if !v128_any_true(ok) { continue; }
                        let mut f = f32x4_sub(one, f32x4_mul(d2, sp(1.0 / r2)));
                        f = f32x4_mul(f, f);
                        let lam = f32x4_add(sp(0.3), f32x4_div(f32x4_mul(sp(0.7), comp), f32x4_sqrt(f32x4_add(d2, sp(1e-4)))));
                        f = f32x4_mul(f, v128_bitselect(one, lam, spr));
                        f = v128_and(f, ok);
                        let trace = (rt >= 2 || (rt == 1 && li < 4)) && v128_any_true(f32x4_lt(d, vrt));
                        if trace && v128_any_true(f32x4_gt(f32x4_mul(f, sp(int)), sp(0.03))) {
                            let mut fq = lanes(f);
                            let nn = [n01 as u8, (n01 >> 8) as u8, n23 as u8, (n23 >> 8) as u8];
                            let (ax, ay, az) = (lanes(qx), lanes(qy), lanes(qz));
                            if rt == 3 {
                                let mut vis = [0.0f32; 4];
                                let mut has = [false; 4];
                                for q in 0..4 {
                                    if fq[q] * int <= 0.03 { continue; }
                                    let j = JIT[q];
                                    let (tx, ty, tz) = (lx + j[0] * LSOFT, ly + j[1] * LSOFT, lz + j[2] * LSOFT);
                                    let (ox, oy, oz) = ray_origin(nn[q], ax[q], ay[q], az[q], tx, ty, tz);
                                    rays += 1;
                                    vis[q] = if occluded(ox, oy, oz, tx, ty, tz) { 0.0 } else { 1.0 };
                                    has[q] = true;
                                }
                                let mut sm = [1.0f32; 4];
                                for q in 0..4 {
                                    if !has[q] { continue; }
                                    let (mut s, mut c) = (vis[q], 1.0f32);
                                    for p in 0..4 { if p != q && has[p] && coherent(&nn, &ax, &ay, &az, q, p) { s += vis[p]; c += 1.0; } }
                                    sm[q] = 0.06 + 0.94 * s / c;
                                }
                                for q in 0..4 { fq[q] *= sm[q]; }
                            } else {
                                let mut done = [false; 4];
                                for q in 0..4 {
                                    if done[q] || fq[q] * int <= 0.03 { continue; }
                                    let (ox, oy, oz) = ray_origin(nn[q], ax[q], ay[q], az[q], lx, ly, lz);
                                    rays += 1;
                                    let m = if occluded(ox, oy, oz, lx, ly, lz) { 0.06 } else { 1.0 };
                                    fq[q] *= m;
                                    done[q] = true;
                                    for p in (q + 1)..4 {
                                        if !done[p] && fq[p] > 0.0 && coherent(&nn, &ax, &ay, &az, q, p) { fq[p] *= m; done[p] = true; }
                                    }
                                }
                            }
                            f = from_lanes(fq);
                        }
                        cr = f32x4_add(cr, f32x4_mul(f, sp(lr * int)));
                        cg = f32x4_add(cg, f32x4_mul(f, sp(lg * int)));
                        cb = f32x4_add(cb, f32x4_mul(f, sp(lb * int)));
                    }
                    let m255 = u32x4_splat(255);
                    let r = f32x4_convert_i32x4(v128_and(cbuf, m255));
                    let g = f32x4_convert_i32x4(v128_and(u32x4_shr(cbuf, 8), m255));
                    let b = f32x4_convert_i32x4(v128_and(u32x4_shr(cbuf, 16), m255));
                    let lim = sp(1.8);
                    let top = sp(255.0);
                    let r = i32x4_trunc_sat_f32x4(f32x4_pmin(f32x4_mul(r, f32x4_pmin(cr, lim)), top));
                    let g = i32x4_trunc_sat_f32x4(f32x4_pmin(f32x4_mul(g, f32x4_pmin(cg, lim)), top));
                    let b = i32x4_trunc_sat_f32x4(f32x4_pmin(f32x4_mul(b, f32x4_pmin(cb, lim)), top));
                    let px4 = v128_or(v128_or(u32x4_splat(BLACK), u32x4_shl(b, 16)), v128_or(u32x4_shl(g, 8), r));
                    store_quad(v128_bitselect(px4, cbuf, on), x, y);
                    y += 2;
                }
                x += 2;
            }
            ty0 += TS;
        }
        tx0 += TS;
    }
    rays
}

// ======================= resplandor (bloom) =======================
static mut GDS: [u32; 200 * 125] = [0; 200 * 125];
#[no_mangle] pub unsafe extern "C" fn p_gds() -> *mut u32 { GDS.as_mut_ptr() }

#[no_mangle]
pub unsafe extern "C" fn bloom_down(rw: i32, rh: i32, cx0: i32, cx1: i32) {
    let rw = imax(4, imin(rw, 800));
    let rh = imax(4, imin(rh, 500));
    let (b0, b1) = (imax(0, imin(cx0, rw)) / 4, imax(0, imin(cx1, rw)) / 4);
    let (w, h) = (b1 - b0, rh / 4);
    for bx in b0..b1 {
        for by in 0..h {
            let (mut r, mut g, mut b) = (0u32, 0u32, 0u32);
            for xx in 0..4 {
                let col = ((bx * 4 + xx) * rh + by * 4) as usize;
                for yy in 0..4 {
                    let c = rd!(GBUF[col + yy]);
                    r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255;
                }
            }
            let (r, g, b) = ((r * 3 / 32).min(255), (g * 3 / 32).min(255), (b * 3 / 32).min(255));
            wr!(GDS[(by * w + bx - b0) as usize] = BLACK | (b << 16) | (g << 8) | r);
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn set_res(_rw: i32, _rh: i32) {}

// ======================= sprites y partículas =======================
#[no_mangle]
pub unsafe extern "C" fn sprite_pass(n: i32, cx0: i32, cx1: i32) {
    let (rw, rh) = (RW, RH);
    let (cx0, cx1) = (imax(0, cx0), imin(rw, cx1));
    for k in 0..imax(0, imin(n, MAXSPR as i32)) as usize {
        let o = k * 8;
        let (off, nn) = (SPRI[o] as usize, SPRI[o + 1] as i32);
        let (x0, x1, y0, y1, ty, a) = (SPRI[o + 2], SPRI[o + 3], SPRI[o + 4], SPRI[o + 5], SPRI[o + 6], SPRI[o + 7]);
        if nn <= 0 || off + (nn * nn) as usize > ATLAS_MAX || !(x1 > x0) || !(y1 > y0) { continue; }
        let (xa, xb) = (imax(cx0, x0 as i32), imin(cx1, x1 as i32));
        let (ya, yb) = (imax(0, y0 as i32), imin(rh, y1 as i32));
        let (kx, ky) = (nn as f32 / (x1 - x0), nn as f32 / (y1 - y0));
        for x in xa..xb {
            let tx = imin(nn - 1, ((x as f32 - x0) * kx) as i32);
            if tx < 0 { continue; }
            let col = (x * rh) as usize;
            for y in ya..yb {
                let i = col + y as usize;
                if rd!(DEPTH[i]) <= ty { continue; }
                let ty_ = imin(nn - 1, ((y as f32 - y0) * ky) as i32);
                if ty_ < 0 { continue; }
                let t = rd!(ATLAS[off + (ty_ * nn + tx) as usize]);
                if t == 0 { continue; }
                let c = t | 0xff00_0000;
                wr!(BUF[i] = c); wr!(DEPTH[i] = ty); wr!(NRM[i] = 6); wr!(AMB[i] = a);
                wr!(GBUF[i] = if t >> 24 == 0xfe { c } else { BLACK });
            }
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn particle_pass(n: i32, fx: f32, fy: f32, fz: f32, rx: f32, ry: f32, ux: f32, uy: f32, uz: f32, cy: f32, cx0: i32, cx1: i32) {
    let (rw, rh, proj, px, py, camz) = (RW, RH, PROJ, CPX, CPY, CAMZ);
    let (cx0, cx1) = (imax(0, cx0), imin(rw, cx1));
    let half = rw as f32 / 2.0;
    for k in 0..imax(0, imin(n, MAXPT as i32)) as usize {
        let (vx, vy, vz) = (PTX[k] - px, PTY[k] - py, PTZ[k] - camz);
        let ty = vx * fx + vy * fy + vz * fz;
        if !(ty >= 0.15) { continue; }
        let kk = proj / ty;
        let sx = (half + (vx * rx + vy * ry) * kk) as i32;
        let sy = (cy - (vx * ux + vy * uy + vz * uz) * kk) as i32;
        let r = imax(1, imin(5, (0.025 * kk) as i32));
        let r2 = r * r + r;
        let c = PTC[k];
        for y in imax(0, sy - r)..imin(rh, sy + r + 1) {
            for x in imax(cx0, sx - r)..imin(cx1, sx + r + 1) {
                if (x - sx) * (x - sx) + (y - sy) * (y - sy) > r2 { continue; }
                let i = (x * rh + y) as usize;
                if rd!(DEPTH[i]) <= ty { continue; }
                wr!(BUF[i] = c); wr!(GBUF[i] = c);
            }
        }
    }
}
