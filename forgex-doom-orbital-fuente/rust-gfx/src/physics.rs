//! Física del jugador portada línea por línea con reproducibilidad exacta.
#![allow(dead_code)]
#![allow(static_mut_refs)]

use core::arch::wasm32::{f32_floor, f32_sqrt};
use crate::contracts::*;
use crate::sim_state::SIM;
use crate::world;

pub const MOVE: f32 = 3.4;
pub const ROT: f32 = 2.4;
pub const MSENS: f32 = 0.0025;
pub const GRAV: f32 = 20.0;
pub const JUMP: f32 = 7.2;
pub const PAD: f32 = 17.0;
pub const C: f32 = 266.0;
pub const R_EXPLORE: f32 = 260.0;
pub const FALL_LOCK: f32 = 33.0;
pub const FALL_DMG: f32 = 20.0;
pub const REGEN_RESET: f32 = 15.0;
pub const LOOK_MAX: f32 = 1.54;

pub(crate) static mut INP_KEYS: u32 = 0;
pub(crate) static mut INP_JUMP: u32 = 0;
pub(crate) static mut INP_FIRE: u32 = 0;

#[inline(always)]
fn clamp(v: f32, a: f32, b: f32) -> f32 { if v < a { a } else if v > b { b } else { v } }
#[inline(always)]
fn fmin(a: f32, b: f32) -> f32 { if a < b { a } else { b } }
#[inline(always)]
fn fmax(a: f32, b: f32) -> f32 { if a > b { a } else { b } }

#[inline(always)]
pub fn sinf(mut x: f32) -> f32 {
    let inv_tau = 0.15915494309189535; // 1 / (2 * PI)
    x -= 6.283185307179586 * f32_floor(x * inv_tau + 0.5);
    if x > 1.5707963267948966 {
        x = 3.141592653589793 - x;
    } else if x < -1.5707963267948966 {
        x = -3.141592653589793 - x;
    }
    let x2 = x * x;
    x * (1.0 + x2 * (-0.16666666666666666 + x2 * (0.008333333333333333 + x2 * (-0.0001984126984126984 + x2 * (0.000002755731922398589 + x2 * -0.0000000250521083854417)))))
}

#[inline(always)]
pub fn cosf(x: f32) -> f32 {
    sinf(x + 1.5707963267948966)
}

#[inline(always)]
pub fn expf(x: f32) -> f32 {
    let x2 = x * x;
    let x3 = x2 * x;
    let x4 = x2 * x2;
    let x5 = x4 * x;
    let x6 = x3 * x3;
    1.0 + x + x2 * 0.5 + x3 * (1.0 / 6.0) + x4 * (1.0 / 24.0) + x5 * (1.0 / 120.0) + x6 * (1.0 / 720.0)
}

#[inline(always)]
pub fn regen_step(n: u32) -> f32 {
    if n == 0 { return 0.1; }
    if n == 1 { return 0.2; }
    let mut a: f64 = 0.2;
    let mut b: f64 = 0.3;
    for _ in 2..n {
        let sum = a + b;
        let next = ((sum * 10000.0 + 0.5) as i64 as f64) / 10000.0;
        a = b;
        b = next;
    }
    b as f32
}

#[no_mangle]
pub unsafe extern "C" fn sim_input(mx: f32, my: f32, keys: u32, jump: u32, fire: u32) {
    SIM.pa += mx * MSENS;
    SIM.look = clamp(SIM.look - my * MSENS * 0.8, -LOOK_MAX, LOOK_MAX);
    INP_KEYS = keys;
    if jump != 0 { INP_JUMP = 1; }
    INP_FIRE = fire;
}

pub unsafe fn physics_step(dt: f32) {
    // Teclas de flecha para la cámara
    if (INP_KEYS & 16) != 0 { SIM.pa -= ROT * dt; }
    if (INP_KEYS & 32) != 0 { SIM.pa += ROT * dt; }
    if (INP_KEYS & 64) != 0 { SIM.look = fmin(LOOK_MAX, SIM.look + 1.3 * dt); }
    if (INP_KEYS & 128) != 0 { SIM.look = fmax(-LOOK_MAX, SIM.look - 1.5 * dt); }

    let dx = cosf(SIM.pa);
    let dy = sinf(SIM.pa);
    let fwd = if (INP_KEYS & 1) != 0 { 1.0 } else { 0.0 } - if (INP_KEYS & 4) != 0 { 1.0 } else { 0.0 };
    let str = if (INP_KEYS & 8) != 0 { 1.0 } else { 0.0 } - if (INP_KEYS & 2) != 0 { 1.0 } else { 0.0 };
    let mx = (dx * fwd - dy * str) * MOVE * dt + SIM.kx * dt;
    let my = (dy * fwd + dx * str) * MOVE * dt + SIM.ky * dt;
    let kd = expf((if SIM.ground != 0 { -7.0 } else { -1.1 }) * dt);
    SIM.kx *= kd;
    SIM.ky *= kd;

    // Colisión horizontal X
    if mx != 0.0 {
        let off = if mx > 0.0 { 0.2 } else { -0.2 };
        if !world::blocked(SIM.px + mx + off, SIM.py, SIM.pz) {
            SIM.px += mx;
        } else {
            SIM.kx = 0.0;
        }
    }
    // Colisión horizontal Y
    if my != 0.0 {
        let off = if my > 0.0 { 0.2 } else { -0.2 };
        if !world::blocked(SIM.px, SIM.py + my + off, SIM.pz) {
            SIM.py += my;
        } else {
            SIM.ky = 0.0;
        }
    }

    // Pared invisible (límite de exploración circular)
    {
        let ex = SIM.px - C;
        let ey = SIM.py - C;
        let rr = f32_sqrt(ex * ex + ey * ey);
        if rr > R_EXPLORE {
            SIM.px = C + ex / rr * R_EXPLORE;
            SIM.py = C + ey / rr * R_EXPLORE;
            SIM.kx = 0.0;
            SIM.ky = 0.0;
        }
    }

    // Salto
    if INP_JUMP != 0 && SIM.jumps < 2 {
        SIM.vz = JUMP * SIM.jump_mul;
        SIM.jumps += 1;
        SIM.ground = 0;
    }
    INP_JUMP = 0;

    // Gravedad y colisión vertical
    let _vz_old = SIM.vz;
    SIM.vz -= GRAV * dt;
    let mut nz = SIM.pz + SIM.vz * dt;
    SIM.ground = 0;

    let c = world::cell_at(SIM.px, SIM.py);
    if !c.is_null() {
        let mut land_zt = -1e30f32;
        let mut land_found = false;
        let mut land_flags = 0u8;

        let mut cur = *c;
        if SIM.vz <= 0.0 {
            while cur != 0 {
                let b = world::BL.get(cur);
                if SIM.pz >= b.zt - 0.35 && nz <= b.zt && (!land_found || b.zt > land_zt) {
                    land_found = true;
                    land_zt = b.zt;
                    land_flags = b.flags;
                }
                cur = b.next;
            }
        }
        if land_found {
            nz = land_zt;
            SIM.vz = 0.0;
            SIM.ground = 1;
            SIM.jumps = 0;
            if (land_flags & F_PAD) != 0 {
                SIM.vz = PAD * SIM.jump_mul;
                SIM.ground = 0;
                SIM.jumps = 1;
            } else if (land_flags & F_ACID) != 0 {
                SIM.hp -= 12.0 * dt;
                if SIM.hp <= 0.0 {
                    SIM.hp = 0.0;
                    SIM.dead = 1;
                }
            } else {
                if land_zt > SIM.cp_z + 0.2 {
                    SIM.cp_x = SIM.px;
                    SIM.cp_y = SIM.py;
                    SIM.cp_z = land_zt;
                }
                SIM.cp_x = SIM.px;
                SIM.cp_y = SIM.py;
                SIM.cp_z = land_zt;
            }
            if (land_flags & F_ROUTE) != 0 && land_zt > SIM.top { // el récord solo sube en la ruta, como en JS
                SIM.top = land_zt;
            }
        } else if SIM.vz > 0.0 {
            cur = *c;
            while cur != 0 {
                let b = world::BL.get(cur);
                if SIM.pz + 0.9 <= b.zb && nz + 0.9 > b.zb {
                    nz = b.zb - 0.9;
                    SIM.vz = 0.0;
                }
                cur = b.next;
            }
        }
    }
    SIM.pz = nz;

    // Anti-atasco: dentro de un bloque sólido
    if world::solid_at(SIM.px, SIM.py, SIM.pz + 0.5) {
        SIM.stuck += dt;
        if SIM.stuck > 0.4 {
            SIM.px = SIM.cp_x;
            SIM.py = SIM.cp_y;
            SIM.pz = SIM.cp_z;
            SIM.vz = 0.0;
            SIM.kx = 0.0;
            SIM.ky = 0.0;
            SIM.stuck = 0.0;
        }
    } else {
        SIM.stuck = 0.0;
    }

    // Caída al vacío
    if SIM.pz < SIM.cp_z - 14.0 {
        SIM.px = SIM.cp_x;
        SIM.py = SIM.cp_y;
        SIM.pz = SIM.cp_z;
        SIM.vz = 0.0;
        SIM.kx = 0.0;
        SIM.ky = 0.0;
        SIM.heal_lock = FALL_LOCK;
        SIM.hp -= FALL_DMG;
        if SIM.hp <= 0.0 {
            SIM.hp = 0.0;
            SIM.dead = 1;
        }
    }

    // Curación y regeneración Fibonacci
    let moving = fwd != 0.0 || str != 0.0;
    let still = !moving && SIM.ground != 0 && INP_FIRE == 0;
    if SIM.heal_lock > 0.0 {
        SIM.heal_lock = fmax(0.0, SIM.heal_lock - dt);
    }
    let can_heal = still && SIM.reserve >= 1.0 && SIM.hp < SIM.max_hp && SIM.heal_lock <= 0.0;
    if can_heal {
        if SIM.regen_pend > 0 {
            SIM.regen_drip += dt;
            while SIM.regen_drip >= 0.02 && SIM.regen_pend > 0 {
                SIM.regen_drip -= 0.02;
                SIM.regen_pend -= 1;
                let a = fmin(1.0, fmin(SIM.max_hp - SIM.hp, SIM.reserve));
                if a <= 0.0 {
                    SIM.regen_pend = 0;
                    break;
                }
                SIM.hp += a;
                SIM.reserve -= a;
            }
            if SIM.regen_pend == 0 {
                SIM.regen_drip = 0.0;
            }
        } else {
            SIM.regen_t += dt;
            let need = regen_step(SIM.regen_n);
            if SIM.regen_t >= need {
                SIM.regen_t -= need;
                SIM.regen_n += 1;
                if need < 2.1 {
                    let a = fmin(1.0, fmin(SIM.max_hp - SIM.hp, SIM.reserve));
                    if a > 0.0 {
                        SIM.hp += a;
                        SIM.reserve -= a;
                    }
                } else {
                    SIM.regen_pend = 6;
                    SIM.regen_drip = 0.0;
                }
            }
        }
    } else if SIM.regen_n != 0 || SIM.regen_t > 0.0 || SIM.regen_pend != 0 {
        SIM.regen_idle += dt;
        if SIM.regen_idle >= REGEN_RESET {
            SIM.regen_n = 0;
            SIM.regen_t = 0.0;
            SIM.regen_pend = 0;
            SIM.regen_idle = 0.0;
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn sim_physics_step(dt: f32) {
    physics_step(dt);
}

