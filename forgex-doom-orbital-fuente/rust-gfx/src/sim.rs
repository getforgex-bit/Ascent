//! Bucle principal de simulación, IA de enemigos, proyectiles e ítems en Rust.
#![allow(dead_code)]
#![allow(static_mut_refs)]

use core::arch::wasm32::{f32_floor, f32_sqrt};
use crate::ecs::{ENTS, PRJS, ITEMS};
use crate::physics::{physics_step, cosf, sinf};
use crate::sim_state::SIM;
use crate::world;

static mut SIM_RNG: u32 = 123456789;
static mut SKULL_T: f32 = 30.0;

#[inline(always)]
pub fn sim_rand() -> f32 {
    unsafe {
        SIM_RNG = SIM_RNG.wrapping_mul(1664525).wrapping_add(1013904223);
        (SIM_RNG >> 8) as f32 / 16777216.0
    }
}

#[inline(always)]
pub fn sim_rnd(min: f32, max: f32) -> f32 {
    min + sim_rand() * (max - min)
}

#[inline(always)]
fn clamp(v: f32, a: f32, b: f32) -> f32 {
    if v < a { a } else if v > b { b } else { v }
}

#[inline(always)]
fn fmin(a: f32, b: f32) -> f32 {
    if a < b { a } else { b }
}

#[inline(always)]
fn fmax(a: f32, b: f32) -> f32 {
    if a > b { a } else { b }
}

#[inline(always)]
pub fn atan2f(y: f32, x: f32) -> f32 {
    if x == 0.0 {
        if y > 0.0 { 1.57079632679 }
        else if y < 0.0 { -1.57079632679 }
        else { 0.0 }
    } else {
        let abs_y = if y < 0.0 { -y } else { y };
        let abs_x = if x < 0.0 { -x } else { x };
        let a = fmin(abs_x, abs_y) / fmax(abs_x, abs_y);
        let s = a * a;
        let mut r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
        if abs_y > abs_x { r = 1.57079632679 - r; }
        if x < 0.0 { r = 3.14159265359 - r; }
        if y < 0.0 { -r } else { r }
    }
}

// =========================================================================
// Simulación de Enemigos
// =========================================================================

/// Actualiza un único enemigo id. Devuelve true si la criatura terminó de desaparecer.
pub unsafe fn step_enemy(id: u32, dt: f32) -> bool {
    let idx = (id - 1) as usize;
    if ENTS.active[idx] == 0 { return false; }
    let cam_z = SIM.pz + 0.6;
    let chest = SIM.pz + 0.5;
    let kind = ENTS.kind[idx];

    // Animación de muerte: calaveras y cacodemonios caen y desaparecen
    if ENTS.dead_t[idx] > 0.0 {
        ENTS.dead_t[idx] += dt;
        if kind != 0 {
            let fall_spd = if kind == 2 { 2.5 } else { 1.5 };
            ENTS.z[idx] -= fall_spd * ENTS.dead_t[idx] * dt;
            if ENTS.dead_t[idx] > 0.55 {
                return true; // eliminar entidad
            }
        }
        return false;
    }

    if ENTS.hurt[idx] > 0.0 {
        ENTS.hurt[idx] = fmax(0.0, ENTS.hurt[idx] - dt);
    }

    let ex = SIM.px - ENTS.x[idx];
    let ey = SIM.py - ENTS.y[idx];
    let d = f32_sqrt(ex * ex + ey * ey);
    let dz_chest = chest - ENTS.z[idx];
    let d3 = f32_sqrt(ex * ex + ey * ey + dz_chest * dz_chest);
    if d3 > 28.0 {
        return false;
    }

    let eye_z = if kind == 0 { ENTS.z[idx] + 0.7 } else { ENTS.z[idx] };
    let sees = d3 < 16.0 && world::clear_path(ENTS.x[idx], ENTS.y[idx], eye_z, SIM.px, SIM.py, cam_z);

    if kind == 0 { // Imp
        if ENTS.wind[idx] > 0.0 {
            ENTS.wind[idx] -= dt;
            if ENTS.wind[idx] <= 0.0 {
                let tz = chest - eye_z;
                let len = f32_sqrt(ex * ex + ey * ey + tz * tz);
                let sp = 7.5;
                let l = if len > 0.0 { len } else { 1.0 };
                PRJS.spawn(0, ENTS.x[idx], ENTS.y[idx], eye_z, ex / l * sp, ey / l * sp, tz / l * sp, 12.0, 4.0);
            }
        } else if sees {
            if d > 2.2 && ENTS.hurt[idx] <= 0.0 {
                let s = 1.3 * dt;
                let nx = ENTS.x[idx] + (ex / d) * s;
                let ny = ENTS.y[idx] + (ey / d) * s;
                let leash_dx = nx - ENTS.home_x[idx];
                let leash_dy = ny - ENTS.home_y[idx];
                let leash = (leash_dx * leash_dx + leash_dy * leash_dy) < 36.0;
                let sign_x = if ex > 0.0 { 1.0 } else if ex < 0.0 { -1.0 } else { 0.0 };
                let sign_y = if ey > 0.0 { 1.0 } else if ey < 0.0 { -1.0 } else { 0.0 };
                if leash && world::floor_at(nx + sign_x * 0.3, ENTS.y[idx], ENTS.z[idx]) {
                    ENTS.x[idx] = nx;
                }
                if leash && world::floor_at(ENTS.x[idx], ny + sign_y * 0.3, ENTS.z[idx]) {
                    ENTS.y[idx] = ny;
                }
            }
            ENTS.cd[idx] -= dt;
            if ENTS.cd[idx] <= 0.0 {
                ENTS.wind[idx] = 0.65;
                ENTS.cd[idx] = sim_rnd(2.2, 3.6);
            }
        }
    } else if kind == 1 { // Skull
        ENTS.t[idx] -= dt;
        let tx = SIM.px - ENTS.x[idx];
        let ty = SIM.py - ENTS.y[idx];
        let tz = chest + 0.2 - ENTS.z[idx];
        let l_len = f32_sqrt(tx * tx + ty * ty + tz * tz);
        let l = if l_len > 0.0 { l_len } else { 1.0 };

        let move_skull = |vx: f32, vy: f32, vz: f32| -> bool {
            let nx = ENTS.x[idx] + vx * dt;
            let ny = ENTS.y[idx] + vy * dt;
            let nz = ENTS.z[idx] + vz * dt;
            if world::solid_at(nx, ny, nz) {
                return false;
            }
            ENTS.x[idx] = nx;
            ENTS.y[idx] = ny;
            ENTS.z[idx] = nz;
            true
        };

        let state = ENTS.state[idx];
        if state == 0 { // idle
            ENTS.ph[idx] += 2.0 * dt;
            ENTS.z[idx] += sinf(ENTS.ph[idx]) * 0.2 * dt;
            if sees && d3 < 14.0 {
                ENTS.state[idx] = 1; // approach
            }
        } else if state == 1 { // approach
            ENTS.lost[idx] = if sees { 0.0 } else { ENTS.lost[idx] + dt };
            if ENTS.lost[idx] > 3.0 {
                ENTS.state[idx] = 0; // idle
            }
            if l > 4.8 {
                move_skull(tx / l * 3.2, ty / l * 3.2, tz / l * 3.2);
            } else if sees {
                ENTS.state[idx] = 2; // tele
                ENTS.t[idx] = 0.55;
            }
        } else if state == 2 { // tele
            if ENTS.t[idx] <= 0.0 {
                ENTS.state[idx] = 3; // dash
                ENTS.t[idx] = 0.6;
                ENTS.hit[idx] = 0;
                ENTS.dx[idx] = tx / l;
                ENTS.dy[idx] = ty / l;
                ENTS.dz[idx] = tz / l;
            }
        } else if state == 3 { // dash
            if !move_skull(ENTS.dx[idx] * 11.0, ENTS.dy[idx] * 11.0, ENTS.dz[idx] * 11.0) {
                ENTS.state[idx] = 4; // stun
                ENTS.t[idx] = 1.0;
            }
            let hit_dx = SIM.px - ENTS.x[idx];
            let hit_dy = SIM.py - ENTS.y[idx];
            let hit_dz = chest - ENTS.z[idx];
            let hit_d = f32_sqrt(hit_dx * hit_dx + hit_dy * hit_dy + hit_dz * hit_dz);
            if ENTS.hit[idx] == 0 && hit_d < 0.75 {
                ENTS.hit[idx] = 1;
                if SIM.shield_t > 0.0 {
                    ENTS.state[idx] = 4; // stun
                    ENTS.t[idx] = 1.3;
                    ENTS.hp[idx] -= 1.0;
                    if ENTS.hp[idx] <= 0.0 {
                        ENTS.hp[idx] = 0.0;
                        ENTS.dead_t[idx] = 0.001;
                    }
                } else {
                    SIM.hp -= 15.0;
                    SIM.kx += ENTS.dx[idx] * 7.0;
                    SIM.ky += ENTS.dy[idx] * 7.0;
                    SIM.vz += 3.5;
                    SIM.ground = 0;
                    if SIM.hp <= 0.0 {
                        SIM.hp = 0.0;
                        SIM.dead = 1;
                    }
                    ENTS.state[idx] = 5; // recover
                    ENTS.t[idx] = 1.2;
                }
            }
            if ENTS.t[idx] <= 0.0 && ENTS.state[idx] == 3 {
                ENTS.state[idx] = 5; // recover
                ENTS.t[idx] = 1.2;
            }
        } else { // recover (5) / stun (4)
            if ENTS.state[idx] == 5 {
                move_skull(-tx / l * 1.5, -ty / l * 1.5, 0.6);
            }
            if ENTS.t[idx] <= 0.0 {
                ENTS.state[idx] = if sees { 1 } else { 0 };
            }
        }
    } else { // Caco
        let want = if d > 7.5 { 1.0 } else if d < 5.5 { -1.0 } else { 0.0 };
        let s = 0.9 * dt;
        let d_safe = if d > 0.0 { d } else { 1.0 };
        let nx = ENTS.x[idx] + ex / d_safe * s * want;
        let ny = ENTS.y[idx] + ey / d_safe * s * want;
        let z_clamp = clamp(SIM.pz + 1.6 - ENTS.z[idx], -1.0, 1.0);
        let nz = ENTS.z[idx] + z_clamp * 0.8 * dt;
        if sees && !world::solid_at(nx, ny, nz) && !world::solid_at(nx, ny, nz + 0.7) && !world::solid_at(nx, ny, nz - 0.7) {
            ENTS.x[idx] = nx;
            ENTS.y[idx] = ny;
            ENTS.z[idx] = nz;
        }
        if ENTS.wind[idx] > 0.0 {
            ENTS.wind[idx] -= dt;
            if ENTS.wind[idx] <= 0.0 {
                let base = atan2f(ey, ex);
                let tz = chest - ENTS.z[idx];
                let l_len = f32_sqrt(d * d + tz * tz);
                let l = if l_len > 0.0 { l_len } else { 1.0 };
                let sp = 5.0;
                let offs = [-0.22f32, 0.0, 0.22];
                for &off in &offs {
                    let a = base + off;
                    let vx = cosf(a) * d / l * sp;
                    let vy = sinf(a) * d / l * sp;
                    let vz = tz / l * sp;
                    PRJS.spawn(1, ENTS.x[idx], ENTS.y[idx], ENTS.z[idx], vx, vy, vz, 10.0, 5.0);
                }
            }
        } else if sees {
            ENTS.cd[idx] -= dt;
            if ENTS.cd[idx] <= 0.0 {
                ENTS.wind[idx] = 0.9;
                ENTS.cd[idx] = sim_rnd(3.0, 4.5);
            }
        }
    }

    false
}

/// Actualiza la lista de enemigos con LOD basado en distancia y actividad.
pub unsafe fn update_enemies(dt: f32) {
    let chest = SIM.pz + 0.5;
    let ai_hz = crate::config::P_CFG.ai_hz as f32;
    let far_dt = if ai_hz > 0.0 { 1.0 / ai_hz } else { 0.1 };
    let lod_enabled = crate::config::P_CFG.lod != 0;

    for id in 1..=ENTS.used {
        let idx = (id - 1) as usize;
        if ENTS.active[idx] == 0 { continue; }

        let mut edt = dt;
        if ENTS.dead_t[idx] == 0.0 {
            let ex = SIM.px - ENTS.x[idx];
            let ey = SIM.py - ENTS.y[idx];
            let dz = chest - ENTS.z[idx];
            let d3 = f32_sqrt(ex * ex + ey * ey + dz * dz);
            let busy = ENTS.wind[idx] > 0.0 || ENTS.hurt[idx] > 0.0 || (ENTS.kind[idx] == 1 && ENTS.state[idx] != 0);

            if d3 > 28.0 {
                continue; // congelado
            } else if lod_enabled && !busy && d3 > 12.0 {
                ENTS.lod_acc[idx] += dt;
                if ENTS.lod_acc[idx] < far_dt {
                    continue;
                }
                edt = ENTS.lod_acc[idx];
                ENTS.lod_acc[idx] = 0.0;
            } else {
                if ENTS.lod_acc[idx] > 0.0 {
                    edt += ENTS.lod_acc[idx];
                    ENTS.lod_acc[idx] = 0.0;
                }
            }
        }

        let gone = step_enemy(id, edt);
        if gone {
            ENTS.destroy(id);
        }
    }

    // Calaveras que llegan desde el vacío
    SKULL_T -= dt;
    if SKULL_T <= 0.0 {
        let height_factor = fmax(0.45, 1.0 - SIM.pz / 150.0);
        SKULL_T = sim_rnd(22.0, 40.0) * height_factor;
        let mut skull_count = 0u32;
        for id in 1..=ENTS.used {
            let i = (id - 1) as usize;
            if ENTS.active[i] != 0 && ENTS.kind[i] == 1 && ENTS.dead_t[i] == 0.0 {
                skull_count += 1;
            }
        }
        if SIM.pz > 4.0 && skull_count < 3 {
            let a = sim_rnd(0.0, 6.2831853);
            let r = sim_rnd(9.0, 12.0);
            let mw = crate::contracts::MW as f32;
            let mh = crate::contracts::MH as f32;
            let x = clamp(SIM.px + cosf(a) * r, 1.0, mw - 2.0);
            let y = clamp(SIM.py + sinf(a) * r, 1.0, mh - 2.0);
            let z = SIM.pz + sim_rnd(-1.0, 3.0);
            if !world::solid_at(x, y, z) {
                ENTS.spawn(1, x, y, z);
            }
        }
    }
}

// =========================================================================
// Simulación de Proyectiles
// =========================================================================

pub unsafe fn update_projectiles(dt: f32) {
    let chest = SIM.pz + 0.5;
    for id in 1..=PRJS.used {
        let idx = (id - 1) as usize;
        if PRJS.active[idx] == 0 { continue; }
        PRJS.x[idx] += PRJS.vx[idx] * dt;
        PRJS.y[idx] += PRJS.vy[idx] * dt;
        PRJS.z[idx] += PRJS.vz[idx] * dt;
        PRJS.life[idx] -= dt;

        if PRJS.life[idx] <= 0.0 {
            PRJS.destroy(id);
            continue;
        }

        if world::solid_at(PRJS.x[idx], PRJS.y[idx], PRJS.z[idx]) {
            PRJS.life[idx] = 0.0;
            PRJS.destroy(id);
            continue;
        }

        let dx = PRJS.x[idx] - SIM.px;
        let dy = PRJS.y[idx] - SIM.py;
        let dz = PRJS.z[idx] - chest;
        let d = f32_sqrt(dx * dx + dy * dy + dz * dz);
        if d < 0.6 {
            let dmg = PRJS.dmg[idx];
            let pvx = PRJS.vx[idx];
            let pvy = PRJS.vy[idx];
            PRJS.life[idx] = 0.0;
            PRJS.destroy(id);

            if SIM.shield_t <= 0.0 {
                SIM.hp -= dmg;
                SIM.kx += pvx * 0.25;
                SIM.ky += pvy * 0.25;
                if SIM.hp <= 0.0 {
                    SIM.hp = 0.0;
                    SIM.dead = 1;
                }
            }
        }
    }
}

// =========================================================================
// Simulación de Ítems
// =========================================================================

pub unsafe fn update_items(dt: f32) {
    let grav = crate::physics::GRAV;
    for id in 1..=ITEMS.used {
        let idx = (id - 1) as usize;
        if ITEMS.active[idx] == 0 || ITEMS.ground[idx] != 0 {
            continue;
        }
        ITEMS.vz[idx] -= grav * dt;
        let nx = ITEMS.x[idx] + ITEMS.vx[idx] * dt;
        let ny = ITEMS.y[idx] + ITEMS.vy[idx] * dt;
        let nz = ITEMS.z[idx] + ITEMS.vz[idx] * dt;
        if !world::solid_at(nx, ny, ITEMS.z[idx] + 0.1) {
            ITEMS.x[idx] = nx;
            ITEMS.y[idx] = ny;
        } else {
            ITEMS.vx[idx] = 0.0;
            ITEMS.vy[idx] = 0.0;
        }
        let c = world::cell_at(ITEMS.x[idx], ITEMS.y[idx]);
        let mut landed = false;
        if !c.is_null() && ITEMS.vz[idx] <= 0.0 {
            let mut cur = *c;
            while cur != 0 {
                let b = world::BL.get(cur);
                if b.zt <= ITEMS.z[idx] + 0.05 && b.zt >= nz {
                    ITEMS.z[idx] = b.zt;
                    ITEMS.ground[idx] = 1;
                    ITEMS.vx[idx] = 0.0;
                    ITEMS.vy[idx] = 0.0;
                    ITEMS.vz[idx] = 0.0;
                    landed = true;
                    break;
                }
                cur = b.next;
            }
        }
        if !landed {
            ITEMS.z[idx] = nz;
        }
    }
}

// =========================================================================
// Paso Integral de Simulación y Exportaciones C-ABI
// =========================================================================

#[no_mangle]
pub unsafe extern "C" fn sim_step(dt: f32) {
    physics_step(dt);
    update_enemies(dt);
    update_projectiles(dt);
    update_items(dt);
}

#[no_mangle]
pub unsafe extern "C" fn sim_update_enemies(dt: f32) {
    update_enemies(dt);
}

#[no_mangle]
pub unsafe extern "C" fn sim_update_projectiles(dt: f32) {
    update_projectiles(dt);
}

#[no_mangle]
pub unsafe extern "C" fn sim_update_items(dt: f32) {
    update_items(dt);
}

#[no_mangle]
pub unsafe extern "C" fn sim_spawn(kind: u32, x: f32, y: f32, z: f32) -> u32 {
    let id = ENTS.spawn(kind as u8, x, y, z);
    id.unwrap_or(0)
}

#[no_mangle]
pub unsafe extern "C" fn sim_set_entity(id: u32, kind: u32, x: f32, y: f32, z: f32, hp: f32) {
    if id == 0 || id > ENTS.used { return; }
    let idx = (id - 1) as usize;
    ENTS.active[idx] = 1;
    ENTS.kind[idx] = kind as u8;
    ENTS.x[idx] = x;
    ENTS.y[idx] = y;
    ENTS.z[idx] = z;
    ENTS.hp[idx] = hp;
    ENTS.dead_t[idx] = 0.0;
    ENTS.home_x[idx] = x;
    ENTS.home_y[idx] = y;
    ENTS.home_z[idx] = z;
}

#[no_mangle]
pub unsafe extern "C" fn sim_get_entity(id: u32, out_ptr: *mut f32) {
    if id == 0 || id > ENTS.used { return; }
    let idx = (id - 1) as usize;
    let data = [
        ENTS.active[idx] as f32,
        ENTS.kind[idx] as f32,
        ENTS.x[idx],
        ENTS.y[idx],
        ENTS.z[idx],
        ENTS.hp[idx],
        ENTS.hurt[idx],
        ENTS.dead_t[idx],
        ENTS.state[idx] as f32,
    ];
    core::ptr::copy_nonoverlapping(data.as_ptr(), out_ptr, 9);
}

#[no_mangle]
pub unsafe extern "C" fn sim_destroy_entity(id: u32) {
    ENTS.destroy(id);
}

#[no_mangle]
pub unsafe extern "C" fn sim_live_count() -> u32 {
    ENTS.live
}

#[no_mangle]
pub unsafe extern "C" fn sim_reset_entities() {
    ENTS.reset();
}

#[no_mangle]
pub unsafe extern "C" fn sim_add_item(kind: u32, x: f32, y: f32, z: f32, vx: f32, vy: f32, vz: f32) -> u32 {
    let id = ITEMS.spawn(kind as u8, x, y, z, vx, vy, vz, 0);
    id.unwrap_or(0)
}

#[no_mangle]
pub unsafe extern "C" fn sim_get_item(id: u32, out_ptr: *mut f32) {
    if id == 0 || id > ITEMS.used { return; }
    let idx = (id - 1) as usize;
    let data = [
        ITEMS.active[idx] as f32,
        ITEMS.kind[idx] as f32,
        ITEMS.x[idx],
        ITEMS.y[idx],
        ITEMS.z[idx],
        ITEMS.vx[idx],
        ITEMS.vy[idx],
        ITEMS.vz[idx],
        ITEMS.ground[idx] as f32,
    ];
    core::ptr::copy_nonoverlapping(data.as_ptr(), out_ptr, 9);
}

#[no_mangle]
pub unsafe extern "C" fn sim_item_count() -> u32 {
    ITEMS.live
}

#[no_mangle]
pub unsafe extern "C" fn sim_reset_items() {
    ITEMS.reset();
}

#[no_mangle]
pub unsafe extern "C" fn sim_spawn_projectile(
    kind: u32, x: f32, y: f32, z: f32,
    vx: f32, vy: f32, vz: f32, dmg: f32, life: f32,
) -> u32 {
    let id = PRJS.spawn(kind as u8, x, y, z, vx, vy, vz, dmg, life);
    id.unwrap_or(0)
}

#[no_mangle]
pub unsafe extern "C" fn sim_projectile_count() -> u32 {
    PRJS.live
}

#[no_mangle]
pub unsafe extern "C" fn sim_reset_projectiles() {
    PRJS.reset();
}

#[no_mangle]
pub unsafe extern "C" fn sim_hash() -> u32 {
    let mut h: u32 = 2166136261;
    let mix = |h: &mut u32, v: f32| {
        let q = f32_floor(v * 10000.0 + 0.5) as i32;
        *h ^= q as u32;
        *h = h.wrapping_mul(16777619);
    };
    mix(&mut h, SIM.px);
    mix(&mut h, SIM.py);
    mix(&mut h, SIM.pz);
    mix(&mut h, SIM.pa);
    mix(&mut h, SIM.look);
    for i in 0..ENTS.used as usize {
        if ENTS.active[i] == 0 { continue; }
        mix(&mut h, ENTS.x[i]);
        mix(&mut h, ENTS.y[i]);
        mix(&mut h, ENTS.z[i]);
        mix(&mut h, ENTS.hp[i]);
    }
    h
}
