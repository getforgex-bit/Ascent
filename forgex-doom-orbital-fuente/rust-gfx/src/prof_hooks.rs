//! Hooks de profiling mínimos para medición de memoria y allocs.
//! Consumidos por el subsistema de telemetría y verificación de cero allocs.
#![allow(static_mut_refs)]

static mut ALLOC_COUNT: u32 = 0;

#[inline(always)]
pub unsafe fn bump_alloc() {
    ALLOC_COUNT = ALLOC_COUNT.wrapping_add(1);
}

#[no_mangle]
pub unsafe extern "C" fn wasm_alloc_count() -> u32 {
    ALLOC_COUNT
}

#[no_mangle]
pub unsafe extern "C" fn wasm_reset_alloc_count() {
    ALLOC_COUNT = 0;
}

#[no_mangle]
pub unsafe extern "C" fn wasm_bytes_static() -> u32 {
    (core::mem::size_of_val(&crate::world::HEAD)
        + core::mem::size_of_val(&crate::world::BL)
        + core::mem::size_of_val(&crate::world::CZ)
        + core::mem::size_of_val(&crate::atlas::TEXLV)
        + core::mem::size_of_val(&crate::atlas::SKY)
        + core::mem::size_of_val(&crate::atlas::ATLAS)
        + core::mem::size_of_val(&crate::render_cpu::BUF)
        + core::mem::size_of_val(&crate::render_cpu::GBUF)
        + core::mem::size_of_val(&crate::render_cpu::DEPTH)
        + core::mem::size_of_val(&crate::render_cpu::OUT)
        + core::mem::size_of_val(&crate::ecs::ENTS)
        + core::mem::size_of_val(&crate::ecs::PRJS)
        + core::mem::size_of_val(&crate::ecs::FLASHES)
    ) as u32
}

#[no_mangle]
pub unsafe extern "C" fn wasm_bytes_live() -> u32 {
    let blocks = (crate::world::BL.live as usize) * core::mem::size_of::<crate::world::Block>();
    let ents = (crate::ecs::ENTS.live as usize) * core::mem::size_of::<f32>() * 16;
    let prjs = (crate::ecs::PRJS.live as usize) * core::mem::size_of::<f32>() * 9;
    (blocks + ents + prjs) as u32
}
