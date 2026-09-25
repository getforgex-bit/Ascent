#![no_std]
#![feature(wasm_numeric_instr)]
#![allow(static_mut_refs)]
#![allow(clippy::all)]

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub mod contracts;
pub mod pool;
pub mod ecs;
pub mod world;
pub mod atlas;
pub mod render_cpu;
pub mod config;
pub mod prof;
pub mod renderer;
pub mod gpu_upload;
pub mod sim_state;
pub mod physics;
pub mod chunk;
pub mod simd_ops;
pub mod scalar_simd;
pub mod hitscan;
pub mod sim;
pub mod prof_hooks;

pub use contracts::*;
pub use pool::*;
pub use ecs::*;
pub use world::*;
pub use atlas::*;
pub use render_cpu::*;
pub use config::*;
pub use prof::*;
pub use renderer::*;
pub use gpu_upload::*;
pub use sim_state::*;
pub use physics::*;
pub use chunk::*;
pub use simd_ops::*;
pub use scalar_simd::*;
pub use hitscan::*;
pub use sim::*;
pub use prof_hooks::*;
