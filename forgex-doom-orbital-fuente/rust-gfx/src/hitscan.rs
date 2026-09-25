//! Hitscan y detección de impactos con SIMD explícito y loteo vectorial.
#![allow(dead_code)]
#![allow(static_mut_refs)]

#[cfg(target_feature = "simd128")]
use core::arch::wasm32::*;

use crate::ecs::ENTS;
use crate::physics::{cosf, sinf};
use crate::sim_state::SIM;
use crate::world;

pub const MAX_HITS: usize = 64;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct HitscanResult {
    pub hit_count: u32,
    pub ids: [u32; MAX_HITS],
    pub along: [f32; MAX_HITS],
}

impl HitscanResult {
    pub const fn new() -> Self {
        Self {
            hit_count: 0,
            ids: [0; MAX_HITS],
            along: [0.0; MAX_HITS],
        }
    }
}

pub static mut HIT_RESULT: HitscanResult = HitscanResult::new();
pub static mut BATCH_RESULTS: [HitscanResult; 4] = [HitscanResult::new(); 4];

#[inline(always)]
fn fabs(v: f32) -> f32 {
    if v < 0.0 { -v } else { v }
}

/// Ejecuta un rayo hitscan desde la posición y ángulo actuales del jugador.
pub unsafe fn hitscan(off: f32, dmg: f32, pierce: bool, range: f32) -> HitscanResult {
    hitscan_at(SIM.px, SIM.py, SIM.pz, SIM.pa, off, dmg, pierce, range)
}

/// Ejecuta un rayo hitscan desde coordenadas explícitas.
pub unsafe fn hitscan_at(
    px: f32, py: f32, pz: f32, pa: f32,
    off: f32, dmg: f32, pierce: bool, range: f32,
) -> HitscanResult {
    let mut res = HitscanResult::new();
    let a = pa + off;
    let ca = cosf(a);
    let sa = sinf(a);
    let cam_z = pz + 0.6; // EYE = 0.6

    for id in 1..=ENTS.used {
        let idx = (id - 1) as usize;
        if ENTS.active[idx] == 0 { continue; }
        // Si ya está muerto, no recibe impactos
        if ENTS.dead_t[idx] > 0.0 || ENTS.hp[idx] <= 0.0 { continue; }

        let dx = ENTS.x[idx] - px;
        let dy = ENTS.y[idx] - py;
        let along = dx * ca + dy * sa;
        if along <= 0.0 || along > range { continue; }

        let rad = if ENTS.kind[idx] == 2 { 0.8 } else { 0.45 };
        let perp = -dx * sa + dy * ca;
        if fabs(perp) > rad { continue; }

        let ez = if ENTS.kind[idx] == 0 { ENTS.z[idx] + 0.55 } else { ENTS.z[idx] };
        if !world::clear_path(px, py, cam_z, ENTS.x[idx], ENTS.y[idx], ez) { continue; }

        let count = res.hit_count as usize;
        if count < MAX_HITS {
            res.ids[count] = id;
            res.along[count] = along;
            res.hit_count += 1;
        }
    }

    // Ordenar resultados por along de menor a mayor (insertion sort sin alocación)
    let n = res.hit_count as usize;
    for i in 1..n {
        let key_along = res.along[i];
        let key_id = res.ids[i];
        let mut j = i;
        while j > 0 && res.along[j - 1] > key_along {
            res.along[j] = res.along[j - 1];
            res.ids[j] = res.ids[j - 1];
            j -= 1;
        }
        res.along[j] = key_along;
        res.ids[j] = key_id;
    }

    // Si no perfora, quedarse solo con el primer impacto
    if !pierce && res.hit_count > 1 {
        res.hit_count = 1;
    }

    // Aplicar daño a las entidades impactadas
    if dmg > 0.0 {
        for i in 0..res.hit_count as usize {
            let hit_id = res.ids[i];
            let hidx = (hit_id - 1) as usize;
            ENTS.hp[hidx] -= dmg;
            ENTS.hurt[hidx] = 0.15;
            if ENTS.kind[hidx] == 1 && ENTS.state[hidx] != 3 { // skull stun si no está en dash
                ENTS.state[hidx] = 4;
                ENTS.t[hidx] = 0.5;
            }
            if ENTS.hp[hidx] <= 0.0 {
                ENTS.hp[hidx] = 0.0;
                ENTS.dead_t[hidx] = 0.001;
            }
        }
    }

    res
}

/// Procesa un lote de 4 rayos hitscan (p. ej. perdigones de escopeta) utilizando SIMD de 128 bits.
pub unsafe fn hitscan_batch4(
    offs: [f32; 4],
    dmg: f32,
    pierce: bool,
    range: f32,
) -> [HitscanResult; 4] {
    let mut results = [HitscanResult::new(); 4];
    let px = SIM.px;
    let py = SIM.py;
    let pz = SIM.pz;
    let pa = SIM.pa;
    let cam_z = pz + 0.6;

    let a0 = pa + offs[0];
    let a1 = pa + offs[1];
    let a2 = pa + offs[2];
    let a3 = pa + offs[3];
    let ca = [cosf(a0), cosf(a1), cosf(a2), cosf(a3)];
    let sa = [sinf(a0), sinf(a1), sinf(a2), sinf(a3)];

    #[cfg(target_feature = "simd128")]
    {
        let ca4 = f32x4(ca[0], ca[1], ca[2], ca[3]);
        let sa4 = f32x4(sa[0], sa[1], sa[2], sa[3]);
        let zero4 = f32x4_splat(0.0);
        let range4 = f32x4_splat(range);

        for id in 1..=ENTS.used {
            let idx = (id - 1) as usize;
            if ENTS.active[idx] == 0 { continue; }
            if ENTS.dead_t[idx] > 0.0 || ENTS.hp[idx] <= 0.0 { continue; }

            let dx = ENTS.x[idx] - px;
            let dy = ENTS.y[idx] - py;
            let dx4 = f32x4_splat(dx);
            let dy4 = f32x4_splat(dy);

            let along4 = f32x4_add(f32x4_mul(dx4, ca4), f32x4_mul(dy4, sa4));
            let perp4 = f32x4_sub(f32x4_mul(dy4, ca4), f32x4_mul(dx4, sa4));
            let perp_abs4 = f32x4_abs(perp4);

            let rad = if ENTS.kind[idx] == 2 { 0.8 } else { 0.45 };
            let rad4 = f32x4_splat(rad);

            let cond_along_gt = f32x4_gt(along4, zero4);
            let cond_along_le = f32x4_le(along4, range4);
            let cond_perp = f32x4_le(perp_abs4, rad4);
            let mask = v128_and(v128_and(cond_along_gt, cond_along_le), cond_perp);

            let mask_u32: [u32; 4] = core::mem::transmute(mask);
            let alongs: [f32; 4] = core::mem::transmute(along4);

            let ez = if ENTS.kind[idx] == 0 { ENTS.z[idx] + 0.55 } else { ENTS.z[idx] };
            let mut checked_los = false;
            let mut los_clear = false;

            for lane in 0..4 {
                if mask_u32[lane] != 0 {
                    if !checked_los {
                        los_clear = world::clear_path(px, py, cam_z, ENTS.x[idx], ENTS.y[idx], ez);
                        checked_los = true;
                    }
                    if los_clear {
                        let c = results[lane].hit_count as usize;
                        if c < MAX_HITS {
                            results[lane].ids[c] = id;
                            results[lane].along[c] = alongs[lane];
                            results[lane].hit_count += 1;
                        }
                    }
                }
            }
        }
    }

    #[cfg(not(target_feature = "simd128"))]
    {
        for id in 1..=ENTS.used {
            let idx = (id - 1) as usize;
            if ENTS.active[idx] == 0 { continue; }
            if ENTS.dead_t[idx] > 0.0 || ENTS.hp[idx] <= 0.0 { continue; }

            let dx = ENTS.x[idx] - px;
            let dy = ENTS.y[idx] - py;
            let rad = if ENTS.kind[idx] == 2 { 0.8 } else { 0.45 };
            let ez = if ENTS.kind[idx] == 0 { ENTS.z[idx] + 0.55 } else { ENTS.z[idx] };
            let mut checked_los = false;
            let mut los_clear = false;

            for lane in 0..4 {
                let along = dx * ca[lane] + dy * sa[lane];
                if along > 0.0 && along <= range {
                    let perp = -dx * sa[lane] + dy * ca[lane];
                    if fabs(perp) <= rad {
                        if !checked_los {
                            los_clear = world::clear_path(px, py, cam_z, ENTS.x[idx], ENTS.y[idx], ez);
                            checked_los = true;
                        }
                        if los_clear {
                            let c = results[lane].hit_count as usize;
                            if c < MAX_HITS {
                                results[lane].ids[c] = id;
                                results[lane].along[c] = along;
                                results[lane].hit_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    // Ordenar y recortar cada rayo
    for lane in 0..4 {
        let n = results[lane].hit_count as usize;
        for i in 1..n {
            let key_along = results[lane].along[i];
            let key_id = results[lane].ids[i];
            let mut j = i;
            while j > 0 && results[lane].along[j - 1] > key_along {
                results[lane].along[j] = results[lane].along[j - 1];
                results[lane].ids[j] = results[lane].ids[j - 1];
                j -= 1;
            }
            results[lane].along[j] = key_along;
            results[lane].ids[j] = key_id;
        }

        if !pierce && results[lane].hit_count > 1 {
            results[lane].hit_count = 1;
        }

        if dmg > 0.0 {
            for i in 0..results[lane].hit_count as usize {
                let hit_id = results[lane].ids[i];
                let hidx = (hit_id - 1) as usize;
                ENTS.hp[hidx] -= dmg;
                ENTS.hurt[hidx] = 0.15;
                if ENTS.kind[hidx] == 1 && ENTS.state[hidx] != 3 {
                    ENTS.state[hidx] = 4;
                    ENTS.t[hidx] = 0.5;
                }
                if ENTS.hp[hidx] <= 0.0 {
                    ENTS.hp[hidx] = 0.0;
                    ENTS.dead_t[hidx] = 0.001;
                }
            }
        }
    }

    results
}

// ======================= Punteros y Wrappers C-ABI =======================

#[no_mangle]
pub unsafe extern "C" fn hitscan_result_ptr() -> *const HitscanResult {
    &HIT_RESULT as *const _
}

#[no_mangle]
pub unsafe extern "C" fn sim_hitscan(off: f32, dmg: f32, pierce: u32, range: f32) -> *const HitscanResult {
    HIT_RESULT = hitscan(off, dmg, pierce != 0, range);
    &HIT_RESULT as *const _
}

#[no_mangle]
pub unsafe extern "C" fn sim_hitscan_batch4(
    off0: f32, off1: f32, off2: f32, off3: f32,
    dmg: f32, pierce: u32, range: f32,
) -> *const HitscanResult {
    BATCH_RESULTS = hitscan_batch4([off0, off1, off2, off3], dmg, pierce != 0, range);
    BATCH_RESULTS.as_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn test_hitscan(
    px: f32, py: f32, pz: f32, pa: f32,
    off: f32, dmg: f32, pierce: u32, range: f32,
) -> *const HitscanResult {
    HIT_RESULT = hitscan_at(px, py, pz, pa, off, dmg, pierce != 0, range);
    &HIT_RESULT as *const _
}
