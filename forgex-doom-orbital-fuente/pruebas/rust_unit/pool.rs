//! Pruebas unitarias para Pool<T, N>.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[path = "../../rust-gfx/src/pool.rs"]
mod pool;

use pool::Pool;

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub fn test_1_cycles() {
    let mut pool: Pool<u32, 128> = Pool::new(0);
    for _ in 0..100_000 {
        let id = pool.alloc().expect("alloc should succeed");
        assert_eq!(pool.live, 1);
        assert_eq!(pool.used, 1);
        *pool.get_mut(id) = 42;
        assert_eq!(*pool.get(id), 42);
        pool.free(id);
        assert_eq!(pool.live, 0);
        assert_eq!(pool.used, 1);
    }
}

pub fn test_2_fill_and_recycle() {
    const N: usize = 16;
    let mut pool: Pool<u32, N> = Pool::new(0);
    let mut ids = [0u32; N];
    for i in 0..N {
        ids[i] = pool.alloc().expect("alloc should succeed");
        *pool.get_mut(ids[i]) = (i + 1) as u32;
    }
    assert_eq!(pool.live, N as u32);
    assert_eq!(pool.used, N as u32);
    assert_eq!(pool.alloc(), None, "pool is full");

    let freed_idx = ids[5];
    pool.free(freed_idx);
    assert_eq!(pool.live, (N - 1) as u32);

    let new_idx = pool.alloc().expect("alloc should reuse freed slot");
    assert_eq!(new_idx, freed_idx);
    assert_eq!(pool.live, N as u32);
}

pub fn test_3_invalid_free() {
    let mut pool: Pool<u32, 8> = Pool::new(0);
    pool.free(0);
    pool.free(999);
    assert_eq!(pool.live, 0);
    assert_eq!(pool.free_head, 0);
}

pub fn test_4_reset() {
    let mut pool: Pool<u32, 8> = Pool::new(0);
    let id1 = pool.alloc().unwrap();
    let _id2 = pool.alloc().unwrap();
    pool.free(id1);
    assert_eq!(pool.live, 1);
    assert_eq!(pool.used, 2);
    assert_ne!(pool.free_head, 0);

    pool.reset();
    assert_eq!(pool.live, 0);
    assert_eq!(pool.used, 0);
    assert_eq!(pool.free_head, 0);
}

#[no_mangle]
pub extern "C" fn run_tests() -> i32 {
    test_1_cycles();
    test_2_fill_and_recycle();
    test_3_invalid_free();
    test_4_reset();
    0
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    run_tests();
    println!("PASS: pruebas/rust_unit/pool.rs completado exitosamente (4/4 tests OK).");
}
