//! Pruebas unitarias para chunk.rs: mapeo, estados, límites y C-ABI.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[path = "../rust-gfx/src/contracts.rs"]
mod contracts;

#[path = "../rust-gfx/src/chunk.rs"]
mod chunk;

use contracts::*;
use chunk::*;

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub fn test_1_chunk_id_zero() {
    assert_eq!(chunk_id(0, 0, 0), 0, "Test 1: chunk_id(0, 0, 0) debe ser 0");
}

pub fn test_2_chunk_id_max() {
    let expected = (N_CHUNKS - 1) as u32;
    let actual = chunk_id(CHUNKS_X - 1, CHUNKS_Y - 1, CHUNKS_Z - 1);
    assert_eq!(actual, expected, "Test 2: chunk_id(16, 16, 7) debe ser N_CHUNKS - 1");
}

pub fn test_3_chunk_coords_roundtrip() {
    let mut rng = 123456789u32;
    for _ in 0..1000 {
        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let a = (rng >> 16) % CHUNKS_X;
        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let b = (rng >> 16) % CHUNKS_Y;
        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let c = (rng >> 16) % CHUNKS_Z;

        let id = chunk_id(a, b, c);
        let coords = chunk_coords(id);
        assert_eq!(coords, (a, b, c), "Test 3: Falló roundtrip");
    }
}

pub fn test_4_chunk_id_f32_edges() {
    // x = 31.9 -> cx = 0
    let id_31_9 = chunk_id_f32(31.9, 0.0, 0.0);
    assert_eq!(chunk_coords(id_31_9), (0, 0, 0), "x=31.9 debe caer en cx=0");

    // x = 32.0 -> cx = 1
    let id_32_0 = chunk_id_f32(32.0, 0.0, 0.0);
    assert_eq!(chunk_coords(id_32_0), (1, 0, 0), "x=32.0 debe caer en cx=1");

    // x = 32.1 -> cx = 1
    let id_32_1 = chunk_id_f32(32.1, 0.0, 0.0);
    assert_eq!(chunk_coords(id_32_1), (1, 0, 0), "x=32.1 debe caer en cx=1");

    // y edges
    let id_y_31_9 = chunk_id_f32(0.0, 31.9, 0.0);
    assert_eq!(chunk_coords(id_y_31_9), (0, 0, 0), "y=31.9 debe caer en cy=0");
    let id_y_32_0 = chunk_id_f32(0.0, 32.0, 0.0);
    assert_eq!(chunk_coords(id_y_32_0), (0, 1, 0), "y=32.0 debe caer en cy=1");

    // z edges (CHUNK_Z = 8)
    let id_z_7_9 = chunk_id_f32(0.0, 0.0, 7.9);
    assert_eq!(chunk_coords(id_z_7_9), (0, 0, 0), "z=7.9 debe caer en cz=0");
    let id_z_8_0 = chunk_id_f32(0.0, 0.0, 8.0);
    assert_eq!(chunk_coords(id_z_8_0), (0, 0, 1), "z=8.0 debe caer en cz=1");

    // Clamping superior: x >= 532, y >= 532, z >= 64
    let id_clamp = chunk_id_f32(999.0, 999.0, 999.0);
    assert_eq!(chunk_coords(id_clamp), (CHUNKS_X - 1, CHUNKS_Y - 1, CHUNKS_Z - 1));

    // Clamping inferior: valores negativos
    let id_neg = chunk_id_f32(-10.0, -5.0, -1.0);
    assert_eq!(chunk_coords(id_neg), (0, 0, 0));
}

pub fn test_5_chunk_of_block_match() {
    let mut rng = 987654321u32;
    for _ in 0..100 {
        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let cell_idx = (rng as usize % NCELL) as u32;
        let x = (cell_idx % (MW as u32)) as f32;
        let y = (cell_idx / (MW as u32)) as f32;
        let ch_block = chunk_of_block(cell_idx);
        let ch_f32 = chunk_id_f32(x, y, 0.0);
        assert_eq!(ch_block, ch_f32, "Test 5: mismatch en cell_idx");
    }
}

pub fn test_6_c_abi_and_bounds() {
    chunk_reset();
    assert_eq!(chunk_state(10), 0);
    set_chunk_state(10, 1);
    assert_eq!(chunk_state(10), 1);
    set_chunk_state(10, 3);
    assert_eq!(chunk_state(10), 3);

    // chunk_bounds
    let b0 = chunk_bounds(0);
    assert_eq!(b0, (0.0, 0.0, 0.0, 32.0, 32.0, 8.0));
    let (cx, cy, cz) = (1, 2, 3);
    let id = chunk_id(cx, cy, cz);
    let b = chunk_bounds(id);
    assert_eq!(b, (32.0, 64.0, 24.0, 64.0, 96.0, 32.0));

    // stats
    chunk_reset();
    set_chunk_state(0, 1); // Cpu
    set_chunk_state(1, 2); // Gpu
    set_chunk_state(2, 3); // Evicted
    let stats_ptr = chunk_stats();
    let stats = unsafe { core::slice::from_raw_parts(stats_ptr, 5) };
    assert_eq!(stats[0], N_CHUNKS as u32);
    assert_eq!(stats[1], 2); // visible (cpu + gpu)
    assert_eq!(stats[2], 1); // cpu
    assert_eq!(stats[3], 1); // gpu
    assert_eq!(stats[4], 1); // evicted

    // p_chunks pointer
    let p = p_chunks();
    assert!(!p.is_null());
    let meta0 = unsafe { &*p };
    assert_eq!(meta0.state, 1);
}

#[no_mangle]
pub extern "C" fn run_tests() -> i32 {
    test_1_chunk_id_zero();
    test_2_chunk_id_max();
    test_3_chunk_coords_roundtrip();
    test_4_chunk_id_f32_edges();
    test_5_chunk_of_block_match();
    test_6_c_abi_and_bounds();
    0
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    run_tests();
    println!("=== TODOS LOS TESTS DE CHUNK PASARON CON ÉXITO ===");
}
