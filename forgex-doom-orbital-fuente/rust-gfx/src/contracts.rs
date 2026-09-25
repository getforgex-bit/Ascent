//! Contratos congelados entre subsistemas. Ningún agente los modifica sin PR conjunto.
#![allow(dead_code)]

// Dimensiones del mundo (deben coincidir con JS)
pub const MW: i32 = 532;
pub const MH: i32 = 532;
pub const NCELL: usize = (MW * MH) as usize;
pub const T: i32 = 128;
pub const TM: i32 = T - 1;
pub const TT: usize = (T * T) as usize;
pub const NL: usize = 16;
pub const NTEX: usize = 8;
pub const MAXP: usize = 800 * 500;
pub const POOL: usize = 900_000;
pub const SKW: i32 = 1536;
pub const SKH: i32 = 768;
pub const MAXL: usize = 16;
pub const MAXS: usize = 64;

// Chunks (contrato con Agente D)
pub const CHUNK_W: u32 = 32;
pub const CHUNK_H: u32 = 32;
pub const CHUNK_Z: u32 = 8;
pub const CHUNKS_X: u32 = (MW as u32 + CHUNK_W - 1) / CHUNK_W;
pub const CHUNKS_Y: u32 = (MH as u32 + CHUNK_H - 1) / CHUNK_H;
pub const CHUNKS_Z: u32 = 8;
pub const N_CHUNKS: usize = (CHUNKS_X * CHUNKS_Y * CHUNKS_Z) as usize;

// Flags de bloque
pub const F_RIM: u8 = 1;
pub const F_SHIP: u8 = 2;
pub const F_PAD: u8 = 4;
pub const F_ACID: u8 = 8;

// Estructuras C-ABI compartidas
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct GpuBlock {
    pub cell: u32,       // índice lineal = y*MW + x
    pub tex_flags: u32,  // tex:8 | flags:8 | ao:8 | pad:8
    pub zb: f32, pub zt: f32,
    pub gx: f32, pub gy: f32, pub gw: f32, pub gh: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct DirtyRange {
    pub cell_min: u32, pub cell_max: u32,     // cell_max es exclusivo
    pub block_min: u32, pub block_max: u32,   // block_max es exclusivo
    pub chunk_min: u32, pub chunk_max: u32,   // chunk_max es exclusivo (Agente D)
    pub _pad: [u32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct SpriteInstance {
    pub atlas_off: u32, pub side: u32,
    pub x0: f32, pub x1: f32, pub y0: f32, pub y1: f32,
    pub depth: f32, pub light: f32,
}

pub type EntityId = u32;
