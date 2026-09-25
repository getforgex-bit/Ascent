//! Pruebas unitarias para ecs.rs (EntitySoA, ProjectilesSoA, FlashesSoA, ParticlesSoA).
#![cfg_attr(target_arch = "wasm32", no_std)]

#[path = "../../rust-gfx/src/contracts.rs"]
pub mod contracts;

#[path = "../../rust-gfx/src/ecs.rs"]
pub mod ecs;

use ecs::*;

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub fn test_1_spawn_different_kinds() {
    let mut ecs = EntitySoA::new();
    assert_eq!(ecs.live, 0);
    assert_eq!(ecs.used, 0);

    let id0 = ecs.spawn(0, 10.0, 20.0, 30.0).expect("spawn kind 0");
    let id1 = ecs.spawn(1, 15.5, 25.5, 35.5).expect("spawn kind 1");
    let id2 = ecs.spawn(2, 40.0, 50.0, 60.0).expect("spawn kind 2");

    assert_eq!(id0, 1);
    assert_eq!(id1, 2);
    assert_eq!(id2, 3);
    assert_eq!(ecs.live, 3);
    assert_eq!(ecs.used, 3);

    // Kind 0
    let idx0 = (id0 - 1) as usize;
    assert_eq!(ecs.active[idx0], 1);
    assert_eq!(ecs.kind[idx0], 0);
    assert_eq!(ecs.x[idx0], 10.0);
    assert_eq!(ecs.y[idx0], 20.0);
    assert_eq!(ecs.z[idx0], 30.0);
    assert_eq!(ecs.hp[idx0], 3.0);

    // Kind 1
    let idx1 = (id1 - 1) as usize;
    assert_eq!(ecs.active[idx1], 1);
    assert_eq!(ecs.kind[idx1], 1);
    assert_eq!(ecs.x[idx1], 15.5);
    assert_eq!(ecs.y[idx1], 25.5);
    assert_eq!(ecs.z[idx1], 35.5);
    assert_eq!(ecs.hp[idx1], 2.0);

    // Kind 2
    let idx2 = (id2 - 1) as usize;
    assert_eq!(ecs.active[idx2], 1);
    assert_eq!(ecs.kind[idx2], 2);
    assert_eq!(ecs.x[idx2], 40.0);
    assert_eq!(ecs.y[idx2], 50.0);
    assert_eq!(ecs.z[idx2], 60.0);
    assert_eq!(ecs.hp[idx2], 8.0);
}

pub fn test_2_iter_active() {
    let mut ecs = EntitySoA::new();
    let id1 = ecs.spawn(0, 1.0, 0.0, 0.0).unwrap();
    let id2 = ecs.spawn(1, 2.0, 0.0, 0.0).unwrap();
    let id3 = ecs.spawn(2, 3.0, 0.0, 0.0).unwrap();

    // Destroy id2
    ecs.destroy(id2);
    assert_eq!(ecs.live, 2);
    assert_eq!(ecs.used, 3);

    let mut count = 0;
    let mut seen1 = false;
    let mut seen2 = false;
    let mut seen3 = false;
    for id in ecs.iter_active() {
        count += 1;
        if id == id1 { seen1 = true; }
        if id == id2 { seen2 = true; }
        if id == id3 { seen3 = true; }
    }
    assert_eq!(count, 2);
    assert!(seen1);
    assert!(!seen2);
    assert!(seen3);

    // Destroy remaining
    ecs.destroy(id1);
    ecs.destroy(id3);
    assert_eq!(ecs.live, 0);
    assert_eq!(ecs.iter_active().count(), 0);
}

pub fn test_3_recycle_lifo() {
    let mut ecs = EntitySoA::new();
    let mut ids = [0u32; 10];
    for i in 0..10 {
        ids[i] = ecs.spawn(0, i as f32, 0.0, 0.0).unwrap();
    }
    assert_eq!(ecs.live, 10);
    assert_eq!(ecs.used, 10);

    // Destroy 5
    ecs.destroy(ids[1]);
    ecs.destroy(ids[3]);
    ecs.destroy(ids[5]);
    ecs.destroy(ids[7]);
    ecs.destroy(ids[9]);
    assert_eq!(ecs.live, 5);
    assert_eq!(ecs.used, 10);

    // Free-list is LIFO stack: last freed was ids[9]=10, then ids[7]=8, ids[5]=6, ids[3]=4, ids[1]=2
    let n1 = ecs.spawn(1, 0.0, 0.0, 0.0).unwrap();
    let n2 = ecs.spawn(1, 0.0, 0.0, 0.0).unwrap();
    let n3 = ecs.spawn(1, 0.0, 0.0, 0.0).unwrap();
    let n4 = ecs.spawn(1, 0.0, 0.0, 0.0).unwrap();
    let n5 = ecs.spawn(1, 0.0, 0.0, 0.0).unwrap();

    assert_eq!(n1, ids[9]);
    assert_eq!(n2, ids[7]);
    assert_eq!(n3, ids[5]);
    assert_eq!(n4, ids[3]);
    assert_eq!(n5, ids[1]);

    assert_eq!(ecs.live, 10);
    assert_eq!(ecs.used, 10);
}

pub fn test_4_stress_cycles() {
    let mut ecs = EntitySoA::new();
    let mut active_ids = [0u32; MAX_ENT];
    let mut active_count = 0usize;

    let mut rng = 987654321u32;

    for _ in 0..10_000 {
        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let action = (rng >> 16) % 2; // 0 = spawn, 1 = destroy

        if action == 0 && active_count < 1000 {
            let kind = ((rng >> 8) % 3) as u8;
            if let Some(id) = ecs.spawn(kind, 0.0, 0.0, 0.0) {
                assert!(id > 0 && (id as usize) <= MAX_ENT);
                assert_eq!(ecs.active[(id - 1) as usize], 1);
                active_ids[active_count] = id;
                active_count += 1;
            }
        } else if active_count > 0 {
            let pick = ((rng >> 8) as usize) % active_count;
            let id = active_ids[pick];
            ecs.destroy(id);
            assert_eq!(ecs.active[(id - 1) as usize], 0);
            active_ids[pick] = active_ids[active_count - 1];
            active_count -= 1;
        }

        assert_eq!(ecs.live, active_count as u32);
        assert!(ecs.live <= ecs.used);
        assert!((ecs.used as usize) <= MAX_ENT);
    }

    // Clean up all remaining
    while active_count > 0 {
        let id = active_ids[active_count - 1];
        ecs.destroy(id);
        active_count -= 1;
    }
    assert_eq!(ecs.live, 0);
    assert_eq!(ecs.iter_active().count(), 0);
}

pub fn test_5_other_soas() {
    let mut prjs = ProjectilesSoA::new();
    let pid = prjs.spawn(1, 1.0, 2.0, 3.0, 0.1, 0.2, 0.3, 50.0, 2.0).unwrap();
    assert_eq!(prjs.live, 1);
    assert_eq!(prjs.dmg[(pid - 1) as usize], 50.0);
    prjs.destroy(pid);
    assert_eq!(prjs.live, 0);

    let mut flashes = FlashesSoA::new();
    let fid = flashes.spawn(1.0, 2.0, 3.0, 1.0, 0.5, 0.0, 10.0, 1.0, 0.9).unwrap();
    assert_eq!(flashes.live, 1);
    assert_eq!(flashes.rad[(fid - 1) as usize], 10.0);
    flashes.destroy(fid);
    assert_eq!(flashes.live, 0);

    let mut parts = ParticlesSoA::new();
    let ptid = parts.spawn(1.0, 2.0, 3.0, 0.0, 1.0, 0.0, 0xFF00FF, 1.5, 42).unwrap();
    assert_eq!(parts.live, 1);
    assert_eq!(parts.col[(ptid - 1) as usize], 0xFF00FF);
    parts.destroy(ptid);
    assert_eq!(parts.live, 0);
}

#[no_mangle]
pub extern "C" fn run_tests() -> i32 {
    test_1_spawn_different_kinds();
    test_2_iter_active();
    test_3_recycle_lifo();
    test_4_stress_cycles();
    test_5_other_soas();
    0
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    run_tests();
    println!("PASS: pruebas/rust_unit/ecs.rs completado exitosamente (5/5 tests OK).");
}
