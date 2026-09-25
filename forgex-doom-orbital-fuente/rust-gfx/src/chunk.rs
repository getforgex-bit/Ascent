//! Estructura espacial de chunks, estados, mapeo de coordenadas y punteros C-ABI.
#![allow(dead_code)]
#![allow(static_mut_refs)]

use crate::contracts::*;

#[repr(u32)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ChunkState {
    Empty = 0,
    Cpu = 1,
    Gpu = 2,
    Evicted = 3,
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ChunkMeta {
    pub state: u32,
    pub last_used: u32,
    pub n_blocks: u32,
    pub z_min: f32,
    pub z_max: f32,
    pub pad: [u32; 2],
}

pub static mut CHUNKS: [ChunkMeta; N_CHUNKS] = [ChunkMeta {
    state: 0,
    last_used: 0,
    n_blocks: 0,
    z_min: 1e30,
    z_max: -1e30,
    pad: [0; 2],
}; N_CHUNKS];

#[inline(always)]
pub fn chunk_id(cx: u32, cy: u32, cz: u32) -> u32 {
    cz * (CHUNKS_X * CHUNKS_Y) + cy * CHUNKS_X + cx
}

#[inline(always)]
pub fn chunk_id_f32(x: f32, y: f32, z: f32) -> u32 {
    let xi = if x < 0.0 { 0 } else { x as u32 };
    let yi = if y < 0.0 { 0 } else { y as u32 };
    let zi = if z < 0.0 { 0 } else { z as u32 };
    let cx = (xi / CHUNK_W).min(CHUNKS_X - 1);
    let cy = (yi / CHUNK_H).min(CHUNKS_Y - 1);
    let cz = (zi / CHUNK_Z).min(CHUNKS_Z - 1);
    chunk_id(cx, cy, cz)
}

#[inline(always)]
pub fn chunk_of_block(cell_idx: u32) -> u32 {
    debug_assert!(cell_idx < NCELL as u32, "cell_idx out of bounds: {}", cell_idx);
    let x = cell_idx % (MW as u32);
    let y = cell_idx / (MW as u32);
    let cx = x / CHUNK_W;
    let cy = y / CHUNK_H;
    chunk_id(cx, cy, 0)
}

#[inline(always)]
pub fn chunk_coords(id: u32) -> (u32, u32, u32) {
    let cz = id / (CHUNKS_X * CHUNKS_Y);
    let rem = id % (CHUNKS_X * CHUNKS_Y);
    let cy = rem / CHUNKS_X;
    let cx = rem % CHUNKS_X;
    (cx, cy, cz)
}

#[inline(always)]
pub fn chunk_bounds(id: u32) -> (f32, f32, f32, f32, f32, f32) {
    let (cx, cy, cz) = chunk_coords(id);
    let x0 = (cx * CHUNK_W) as f32;
    let y0 = (cy * CHUNK_H) as f32;
    let z0 = (cz * CHUNK_Z) as f32;
    (x0, y0, z0, x0 + CHUNK_W as f32, y0 + CHUNK_H as f32, z0 + CHUNK_Z as f32)
}

#[inline(always)]
pub fn chunk_center(id: u32) -> (f32, f32, f32) {
    let (x0, y0, z0, x1, y1, z1) = chunk_bounds(id);
    ((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5)
}

pub fn chunk_reset() {
    unsafe {
        for ch in CHUNKS.iter_mut() {
            *ch = ChunkMeta {
                state: ChunkState::Empty as u32,
                last_used: 0,
                n_blocks: 0,
                z_min: 1e30,
                z_max: -1e30,
                pad: [0; 2],
            };
        }
    }
}

// ================= Punteros y funciones C-ABI =================

#[no_mangle]
pub extern "C" fn chunk_state(id: u32) -> u32 {
    unsafe {
        if (id as usize) < N_CHUNKS {
            CHUNKS[id as usize].state
        } else {
            ChunkState::Empty as u32
        }
    }
}

#[no_mangle]
pub extern "C" fn set_chunk_state(id: u32, state: u32) {
    unsafe {
        if (id as usize) < N_CHUNKS {
            CHUNKS[id as usize].state = state;
        }
    }
}

#[no_mangle]
pub extern "C" fn p_chunks() -> *const ChunkMeta {
    unsafe { CHUNKS.as_ptr() }
}

static mut CHUNK_STATS_BUF: [u32; 5] = [0; 5];

#[no_mangle]
pub extern "C" fn chunk_stats() -> *const u32 {
    let mut cpu = 0u32;
    let mut gpu = 0u32;
    let mut evicted = 0u32;
    unsafe {
        for ch in CHUNKS.iter() {
            match ch.state {
                1 => cpu += 1, // ChunkState::Cpu
                2 => gpu += 1, // ChunkState::Gpu
                3 => evicted += 1, // ChunkState::Evicted
                _ => {}
            }
        }
        // [total, visible, cpu, gpu, evicted]
        CHUNK_STATS_BUF = [N_CHUNKS as u32, cpu + gpu, cpu, gpu, evicted];
        CHUNK_STATS_BUF.as_ptr()
    }
}
