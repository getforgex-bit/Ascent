//! Memoria y manipulación del mundo volumétrico.
#![allow(static_mut_refs)]

use core::arch::wasm32::{f32_floor, f32_sqrt};
use crate::contracts::*;
use crate::pool::Pool;
use crate::chunk::chunk_id_f32;

#[inline(always)]
fn fabs(x: f32) -> f32 { if x < 0.0 { -x } else { x } }
#[inline(always)]
fn fmin(a: f32, b: f32) -> f32 { if a < b { a } else { b } }
#[inline(always)]
fn fmax(a: f32, b: f32) -> f32 { if a > b { a } else { b } }

macro_rules! rd { ($a:ident [ $i:expr ]) => { *$a.get_unchecked($i) } }

#[derive(Clone, Copy, Default)]
#[repr(C)]
pub struct Block {
    pub zb: f32,
    pub zt: f32,
    pub gx: f32,
    pub gy: f32,
    pub gw: f32,
    pub gh: f32,
    pub next: u32, // índice 1-based del siguiente bloque en la celda (0 = fin)
    pub tex: u8,
    pub flags: u8,
    pub ao: u8,
    pub _p: u8,
}
pub const ZB: Block = Block { zb: 0.0, zt: 0.0, gx: 0.0, gy: 0.0, gw: 0.0, gh: 0.0, next: 0, tex: 0, flags: 0, ao: 0, _p: 0 };

// ---------------- memoria del mundo ----------------
pub(crate) static mut HEAD: [u32; NCELL] = [0; NCELL];
pub(crate) static mut BL: Pool<Block, POOL> = Pool::new(ZB);
/// Rangos modificados desde la última consulta (para subir solo eso a la GPU): [celda mín, celda máx+1, bloque mín, bloque máx+1, chunk mín, chunk máx+1]
pub(crate) static mut DIRTY: [u32; 6] = [u32::MAX, 0, u32::MAX, 0, u32::MAX, 0];
#[inline(always)]
pub(crate) unsafe fn dirty_cell(ci: usize) { let c = ci as u32; if c < DIRTY[0] { DIRTY[0] = c; } if c + 1 > DIRTY[1] { DIRTY[1] = c + 1; } }
#[inline(always)]
pub(crate) unsafe fn dirty_block(n: u32) { if n == 0 { return; } let b = n - 1; if b < DIRTY[2] { DIRTY[2] = b; } if b + 1 > DIRTY[3] { DIRTY[3] = b + 1; } }
#[inline(always)]
pub(crate) unsafe fn dirty_chunk(ch: u32) {
    if ch < DIRTY[4] { DIRTY[4] = ch; }
    if ch + 1 > DIRTY[5] { DIRTY[5] = ch + 1; }
}

/// Altura mínima y máxima de todos los bloques: un rayo que sale de ese rango ya no puede chocar con nada.
pub(crate) static mut ZMIN: f32 = 1e30;
/// Rango de alturas ocupado en cada celda [mín zb, máx zt]: el rayo 3D salta la celda si no lo cruza.
pub(crate) static mut CZ: [[f32; 2]; NCELL] = [[0.0; 2]; NCELL]; // se inicializa en w_reset (así no ocupa espacio en el .wasm)
pub(crate) static mut ZMAX: f32 = -1e30;

static mut OPS_ADD: u32 = 0;
static mut OPS_FREE: u32 = 0;

#[no_mangle] pub unsafe extern "C" fn w_ops_add() -> u32 { OPS_ADD }
#[no_mangle] pub unsafe extern "C" fn w_ops_free() -> u32 { OPS_FREE }

#[no_mangle]
pub unsafe extern "C" fn w_reset() {
    for h in HEAD.iter_mut() { *h = 0; }
    for c in CZ.iter_mut() { *c = [1e30, -1e30]; }
    BL.reset(); ZMIN = 1e30; ZMAX = -1e30;
    DIRTY = [0, NCELL as u32, 0, 0, 0, N_CHUNKS as u32];
    OPS_ADD = 0;
    OPS_FREE = 0;
}

#[inline(always)]
pub(crate) unsafe fn free_block(n: u32, ci: usize, zb: f32) {
    OPS_FREE = OPS_FREE.wrapping_add(1);
    dirty_chunk(chunk_id_f32((ci as i32 % MW) as f32, (ci as i32 / MW) as f32, zb));
    BL.free(n);
    dirty_block(n);
}

#[no_mangle]
pub unsafe extern "C" fn w_add(x: i32, y: i32, zb: f32, zt: f32, tex: i32, flags: i32, gx: f32, gy: f32, gw: f32, gh: f32, ao: i32, replace: i32) -> i32 {
    OPS_ADD = OPS_ADD.wrapping_add(1);
    if x < 0 || y < 0 || x >= MW || y >= MH { return 0; }
    let ci = (y * MW + x) as usize;
    if replace != 0 { // igual que el JS: quita los bloques que se solapan en altura
        let mut prev: u32 = 0;
        let mut cur = HEAD[ci];
        while cur != 0 {
            let b = BL[(cur - 1) as usize];
            let nx = b.next;
            if b.zb < zt && b.zt > zb {
                if prev == 0 { HEAD[ci] = nx; } else { BL[(prev - 1) as usize].next = nx; dirty_block(prev); }
                free_block(cur, ci, b.zb);
            } else { prev = cur; }
            cur = nx;
        }
    }
    let n = match BL.alloc() {
        Some(idx) => idx,
        None => return 0,
    };
    // la lista de cada celda queda ordenada por altura (zb ascendente): el rayo 3D deja de mirar al pasar su rango
    let mut prev: u32 = 0;
    let mut cur = HEAD[ci];
    while cur != 0 && BL[(cur - 1) as usize].zb < zb { prev = cur; cur = BL[(cur - 1) as usize].next; }
    BL[(n - 1) as usize] = Block { zb, zt, gx, gy, gw, gh, next: cur, tex: tex as u8, flags: flags as u8, ao: ao as u8, _p: 0 };
    if prev == 0 { HEAD[ci] = n; } else { BL[(prev - 1) as usize].next = n; dirty_block(prev); }
    dirty_block(n); dirty_cell(ci);
    dirty_chunk(chunk_id_f32(x as f32, y as f32, zb));
    let cz = &mut CZ[ci];
    if zb < cz[0] { cz[0] = zb; }
    if zt > cz[1] { cz[1] = zt; }
    if zb < ZMIN { ZMIN = zb; }
    if zt > ZMAX { ZMAX = zt; }
    1
}

#[no_mangle]
pub unsafe extern "C" fn w_set_acid(x: i32, y: i32, zt: f32) {
    if x < 0 || y < 0 || x >= MW || y >= MH { return; }
    let mut cur = HEAD[(y * MW + x) as usize];
    while cur != 0 {
        let b = &mut BL[(cur - 1) as usize];
        if fabs(b.zt - zt) < 0.01 { b.tex = 7; b.flags |= F_ACID; dirty_block(cur); }
        cur = b.next;
    }
}

#[no_mangle]
pub unsafe extern "C" fn w_prune(minz: f32) {
    let (mut lo, mut hi) = (1e30f32, -1e30f32);
    for ci in 0..NCELL {
        let (mut clo, mut chi) = (1e30f32, -1e30f32);
        let mut prev: u32 = 0;
        let mut cur = HEAD[ci];
        while cur != 0 {
            let b = BL[(cur - 1) as usize];
            let nx = b.next;
            if b.zt < minz {
                if prev == 0 { HEAD[ci] = nx; } else { BL[(prev - 1) as usize].next = nx; dirty_block(prev); }
                free_block(cur, ci, b.zb); dirty_cell(ci);
            } else { prev = cur; lo = fmin(lo, b.zb); hi = fmax(hi, b.zt); clo = fmin(clo, b.zb); chi = fmax(chi, b.zt); }
            cur = nx;
        }
        if CZ[ci][0] != clo || CZ[ci][1] != chi { dirty_cell(ci); }
        CZ[ci] = [clo, chi];
    }
    ZMIN = lo; ZMAX = hi;
}

/// Quita los bloques de las celdas [x0, x1) × [y0, y1) cuya base (zb) está en [z0, z1): así JS expulsa un chunk del
/// mundo de render cuando se aleja del jugador. Devuelve cuántos bloques quitó. ZMIN/ZMAX pueden quedar algo más
/// anchos que el mundo real (solo sirven para cortar rayos antes); `w_prune` los vuelve a ajustar.
#[no_mangle]
pub unsafe extern "C" fn w_remove_box(x0: i32, y0: i32, x1: i32, y1: i32, z0: f32, z1: f32) -> i32 {
    let (x0, y0, x1, y1) = (x0.max(0), y0.max(0), x1.min(MW), y1.min(MH));
    let mut n = 0;
    for y in y0..y1 {
        for x in x0..x1 {
            let ci = (y * MW + x) as usize;
            let (mut clo, mut chi) = (1e30f32, -1e30f32);
            let (mut prev, mut cur, mut hit) = (0u32, HEAD[ci], false);
            while cur != 0 {
                let b = BL[(cur - 1) as usize];
                let nx = b.next;
                if b.zb >= z0 && b.zb < z1 {
                    if prev == 0 { HEAD[ci] = nx; } else { BL[(prev - 1) as usize].next = nx; dirty_block(prev); }
                    free_block(cur, ci, b.zb);
                    n += 1; hit = true;
                } else { prev = cur; clo = fmin(clo, b.zb); chi = fmax(chi, b.zt); }
                cur = nx;
            }
            if hit { CZ[ci] = [clo, chi]; dirty_cell(ci); }
        }
    }
    n
}

#[no_mangle]
pub unsafe extern "C" fn w_live() -> i32 { BL.live as i32 }

/// Bloques usados del pool (los índices válidos son 0..w_used()).
#[no_mangle]
pub unsafe extern "C" fn w_used() -> i32 { BL.used as i32 }

pub(crate) static mut WINFO: [f32; 2] = [0.0; 2];
/// [ZMIN, ZMAX] del mundo.
#[no_mangle]
pub unsafe extern "C" fn w_zrange() -> *const f32 { WINFO = [ZMIN, ZMAX]; WINFO.as_ptr() }

pub(crate) static mut DOUT: [u32; 8] = [0; 8];
/// Devuelve y reinicia los rangos modificados: [celda mín, celda máx+1, bloque mín, bloque máx+1, chunk mín, chunk máx+1] (vacío si mín >= máx).
#[no_mangle]
pub unsafe extern "C" fn w_dirty() -> *const u32 {
    DOUT[0] = DIRTY[0];
    DOUT[1] = DIRTY[1];
    DOUT[2] = DIRTY[2];
    DOUT[3] = DIRTY[3];
    DOUT[4] = DIRTY[4];
    DOUT[5] = DIRTY[5];
    DOUT[6] = 0;
    DOUT[7] = 0;
    DIRTY = [u32::MAX, 0, u32::MAX, 0, u32::MAX, 0];
    DOUT.as_ptr()
}

#[no_mangle] pub unsafe extern "C" fn p_head() -> *const u32 { HEAD.as_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_bl() -> *const Block { BL.data.as_ptr() }
#[no_mangle] pub unsafe extern "C" fn p_cz() -> *const [f32; 2] { CZ.as_ptr() }

// ======================= trazado de rayos de sombra =======================
/// ¿Hay algún bloque entre (x0,y0,z0) y (x1,y1,z1)? DDA sobre la rejilla XY y, en cada celda,
/// prueba del intervalo Z que recorre el segmento contra cada bloque apilado.
pub(crate) unsafe fn occluded(x0: f32, y0: f32, z0: f32, x1: f32, y1: f32, z1: f32) -> bool {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let dz = z1 - z0;
    let mut cx = f32_floor(x0) as i32;
    let mut cy = f32_floor(y0) as i32;
    let stx = if dx > 0.0 { 1 } else { -1 };
    let sty = if dy > 0.0 { 1 } else { -1 };
    let tdx = if dx != 0.0 { fabs(1.0 / dx) } else { 1e30 };
    let tdy = if dy != 0.0 { fabs(1.0 / dy) } else { 1e30 };
    let mut tmx = if dx > 0.0 { (cx as f32 + 1.0 - x0) * tdx } else if dx < 0.0 { (x0 - cx as f32) * tdx } else { 1e30 };
    let mut tmy = if dy > 0.0 { (cy as f32 + 1.0 - y0) * tdy } else if dy < 0.0 { (y0 - cy as f32) * tdy } else { 1e30 };
    let mut t0 = 0.0f32;
    for _ in 0..96 {
        let t1 = fmin(fmin(tmx, tmy), 1.0);
        if cx >= 0 && cy >= 0 && cx < MW && cy < MH {
            let mut bi = rd!(HEAD[(cy * MW + cx) as usize]);
            if bi != 0 {
                let za = z0 + dz * t0;
                let zb = z0 + dz * t1;
                let lo = fmin(za, zb);
                let hi = fmax(za, zb);
                while bi != 0 {
                    let b = BL.get_unchecked((bi - 1) as usize);
                    if b.zb < hi && b.zt > lo { return true; }
                    bi = b.next;
                }
            }
        }
        if t1 >= 1.0 { break; }
        t0 = t1;
        if tmx < tmy { cx += stx; tmx += tdx; } else { cy += sty; tmy += tdy; }
    }
    false
}

// ======================= consultas espaciales (física y sim) =======================
#[inline(always)]
pub unsafe fn cell_at(x: f32, y: f32) -> *const u32 {
    let cx = f32_floor(x) as i32;
    let cy = f32_floor(y) as i32;
    if cx < 0 || cy < 0 || cx >= MW || cy >= MH { return core::ptr::null(); }
    &HEAD[(cy * MW + cx) as usize] as *const u32
}

#[inline(always)]
pub unsafe fn blocked(x: f32, y: f32, z: f32) -> bool {
    let c = cell_at(x, y);
    if c.is_null() { return false; }
    let mut cur = *c;
    while cur != 0 {
        let b = BL.get(cur);
        if b.zt > z + 0.35 && b.zb < z + 0.95 { return true; }
        cur = b.next;
    }
    false
}

#[inline(always)]
pub unsafe fn floor_at(x: f32, y: f32, z: f32) -> bool {
    let c = cell_at(x, y);
    if c.is_null() { return false; }
    let mut cur = *c;
    let mut f = false;
    while cur != 0 {
        let b = BL.get(cur);
        if fabs(b.zt - z) < 0.02 {
            f = true;
        } else if b.zt > z + 0.35 && b.zb < z + 0.95 {
            return false;
        }
        cur = b.next;
    }
    f
}

#[inline(always)]
pub unsafe fn solid_at(x: f32, y: f32, z: f32) -> bool {
    let c = cell_at(x, y);
    if c.is_null() { return false; }
    let mut cur = *c;
    while cur != 0 {
        let b = BL.get(cur);
        if z > b.zb && z < b.zt { return true; }
        cur = b.next;
    }
    false
}

#[inline(always)]
pub unsafe fn clear_path(x0: f32, y0: f32, z0: f32, x1: f32, y1: f32, z1: f32) -> bool {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let dz = z1 - z0;
    let dist = f32_sqrt(dx * dx + dy * dy + dz * dz);
    let n = core::cmp::max(8, (dist * 6.0) as i32);
    let inv_n = 1.0 / (n as f32);
    for k in 1..n {
        let t = (k as f32) * inv_n;
        if solid_at(x0 + dx * t, y0 + dy * t, z0 + dz * t) {
            return false;
        }
    }
    true
}

#[no_mangle] pub unsafe extern "C" fn c_blocked(x: f32, y: f32, z: f32) -> i32 { blocked(x, y, z) as i32 }
#[no_mangle] pub unsafe extern "C" fn c_floor_at(x: f32, y: f32, z: f32) -> i32 { floor_at(x, y, z) as i32 }
#[no_mangle] pub unsafe extern "C" fn c_solid_at(x: f32, y: f32, z: f32) -> i32 { solid_at(x, y, z) as i32 }
#[no_mangle] pub unsafe extern "C" fn c_clear_path(x0: f32, y0: f32, z0: f32, x1: f32, y1: f32, z1: f32) -> i32 { clear_path(x0, y0, z0, x1, y1, z1) as i32 }

