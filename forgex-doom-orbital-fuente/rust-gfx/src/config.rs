//! Configuración central en Rust de FORGEX DOOM Orbital.
//! Estructuras congeladas C-compatibles y funciones de consulta y ajuste.

#[repr(C)]
#[derive(Clone, Copy)]
pub struct GraphicsConfig {
    pub backend: u32,
    pub quality: u32,
    pub dynamic_res: u32,
    pub draw_distance: f32,
    pub lighting: u32,
    pub particles: u32,
    pub bloom: u32,
    pub grain: u32,
    pub cam3d: u32,
    pub rt_mode: u32,
    pub rt_max_dist: f32,
    pub rt_rays: u32,
    pub rt_temporal: u32,
    pub rt_denoise: u32,
    pub rt_indirect: u32,
    pub chunk_size_x: u32,
    pub chunk_size_y: u32,
    pub chunk_size_z: u32,
    pub stream_radius: f32,
    pub allow_software_gpu: u32,
    pub _pad: [u32; 12],
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PerformanceConfig {
    pub auto: u32,
    pub target_fps: u32,
    pub sim_hz: u32,
    pub ai_hz: u32,
    pub interpolate: u32,
    pub lod: u32,
    pub culling: u32,
    pub stats_hz: u32,
    pub frames_in_flight: u32,
    pub workers: u32,
    pub simd_on: u32,
    pub _pad: u32,
}

pub static mut G_CFG: GraphicsConfig = GraphicsConfig {
    backend: 0,
    quality: 2,
    dynamic_res: 1,
    draw_distance: 40.0,
    lighting: 2,
    particles: 2,
    bloom: 1,
    grain: 1,
    cam3d: 0,
    rt_mode: 1,
    rt_max_dist: 16.0,
    rt_rays: 1,
    rt_temporal: 1,
    rt_denoise: 2,
    rt_indirect: 0,
    chunk_size_x: 16,
    chunk_size_y: 16,
    chunk_size_z: 16,
    stream_radius: 12.0,
    allow_software_gpu: 0,
    _pad: [0; 12],
};

pub static mut P_CFG: PerformanceConfig = PerformanceConfig {
    auto: 1,
    target_fps: 60,
    sim_hz: 60,
    ai_hz: 15,
    interpolate: 1,
    lod: 1,
    culling: 1,
    stats_hz: 10,
    frames_in_flight: 2,
    workers: 0,
    simd_on: 1,
    _pad: 0,
};

#[no_mangle]
pub extern "C" fn get_gfx_cfg() -> *const GraphicsConfig {
    core::ptr::addr_of!(G_CFG)
}

#[no_mangle]
pub extern "C" fn get_perf_cfg() -> *const PerformanceConfig {
    core::ptr::addr_of!(P_CFG)
}

#[no_mangle]
pub extern "C" fn size_of_gfx_cfg() -> u32 {
    core::mem::size_of::<GraphicsConfig>() as u32
}

#[no_mangle]
pub extern "C" fn size_of_perf_cfg() -> u32 {
    core::mem::size_of::<PerformanceConfig>() as u32
}

#[no_mangle]
pub unsafe extern "C" fn set_gfx_cfg(cfg: *const GraphicsConfig) {
    if cfg.is_null() { return; }
    let mut c = *cfg;
    c.backend = c.backend.min(3);
    c.quality = c.quality.min(3);
    c.dynamic_res = if c.dynamic_res != 0 { 1 } else { 0 };
    c.draw_distance = c.draw_distance.max(8.0).min(64.0);
    c.lighting = c.lighting.min(2);
    c.particles = c.particles.min(2);
    c.bloom = if c.bloom != 0 { 1 } else { 0 };
    c.grain = if c.grain != 0 { 1 } else { 0 };
    c.cam3d = if c.cam3d != 0 { 1 } else { 0 };
    c.rt_mode = c.rt_mode.min(3);
    c.rt_max_dist = c.rt_max_dist.max(1.0).min(64.0);
    c.rt_rays = c.rt_rays.min(4).max(1);
    c.rt_temporal = if c.rt_temporal != 0 { 1 } else { 0 };
    c.rt_denoise = c.rt_denoise.min(3);
    c.rt_indirect = if c.rt_indirect != 0 { 1 } else { 0 };
    c.chunk_size_x = c.chunk_size_x.max(4).min(64);
    c.chunk_size_y = c.chunk_size_y.max(4).min(64);
    c.chunk_size_z = c.chunk_size_z.max(4).min(64);
    c.stream_radius = c.stream_radius.max(2.0).min(20.0);
    c.allow_software_gpu = if c.allow_software_gpu != 0 { 1 } else { 0 };
    G_CFG = c;
}

#[no_mangle]
pub unsafe extern "C" fn set_perf_cfg(cfg: *const PerformanceConfig) {
    if cfg.is_null() { return; }
    let mut c = *cfg;
    c.auto = if c.auto != 0 { 1 } else { 0 };
    c.target_fps = c.target_fps.max(15).min(360);
    c.sim_hz = c.sim_hz.max(10).min(240);
    c.ai_hz = c.ai_hz.max(1).min(120);
    c.interpolate = if c.interpolate != 0 { 1 } else { 0 };
    c.lod = if c.lod != 0 { 1 } else { 0 };
    c.culling = if c.culling != 0 { 1 } else { 0 };
    c.stats_hz = c.stats_hz.max(1).min(60);
    c.frames_in_flight = c.frames_in_flight.max(1).min(4);
    c.workers = c.workers.min(16);
    c.simd_on = if c.simd_on != 0 { 1 } else { 0 };
    P_CFG = c;
}
