//! Subida diferencial e inicial de buffers para WebGPU.
#![allow(static_mut_refs)]

use crate::contracts::*;
use crate::atlas::*;
use crate::world::{BL, HEAD};
use crate::renderer::*;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct StaticUploadInfo {
    pub atlas_ptr: *const u32,
    pub atlas_len: u32,
    pub sky_ptr: *const u32,
    pub sky_w: u32,
    pub sky_h: u32,
    pub texlv_ptr: *const u32,
    pub texlv_len: u32,
    pub texem_ptr: *const u8,
    pub texem_len: u32,
    pub texgl_ptr: *const u32,
    pub texgl_len: u32,
}

static mut STATIC_INFO: StaticUploadInfo = StaticUploadInfo {
    atlas_ptr: core::ptr::null(),
    atlas_len: 0,
    sky_ptr: core::ptr::null(),
    sky_w: SKW as u32,
    sky_h: SKH as u32,
    texlv_ptr: core::ptr::null(),
    texlv_len: 0,
    texem_ptr: core::ptr::null(),
    texem_len: 0,
    texgl_ptr: core::ptr::null(),
    texgl_len: 0,
};

static mut GPU_STAGE: [GpuBlock; POOL] = [GpuBlock {
    cell: 0,
    tex_flags: 0,
    zb: 0.0,
    zt: 0.0,
    gx: 0.0,
    gy: 0.0,
    gw: 0.0,
    gh: 0.0,
}; POOL];

#[no_mangle]
pub unsafe extern "C" fn p_gpu_stage() -> *const GpuBlock {
    GPU_STAGE.as_ptr()
}

/// Configura y devuelve los punteros de los recursos estáticos del mundo para la subida inicial a la GPU.
#[no_mangle]
pub unsafe extern "C" fn gpu_upload_static_info() -> *const StaticUploadInfo {
    STATIC_INFO = StaticUploadInfo {
        atlas_ptr: p_atlas(),
        atlas_len: atlas_max() as u32,
        sky_ptr: p_sky(),
        sky_w: SKW as u32,
        sky_h: SKH as u32,
        texlv_ptr: p_texlv(),
        texlv_len: (NTEX * NL * TT) as u32,
        texem_ptr: p_texem(),
        texem_len: (NTEX * TT) as u32,
        texgl_ptr: p_texgl(),
        texgl_len: (NTEX * TT) as u32,
    };
    &STATIC_INFO as *const _
}

/// Empaqueta todos los bloques activos de BL en GPU_STAGE para la subida inicial completa a storage buffer.
#[no_mangle]
pub unsafe extern "C" fn gpu_upload_world() -> u32 {
    let n = (BL.used as usize).min(POOL);
    for i in 0..n {
        let b = &BL.data[i];
        let tf = (b.tex as u32) | ((b.flags as u32) << 8) | ((b.ao as u32) << 16);
        GPU_STAGE[i] = GpuBlock {
            cell: b.next,
            tex_flags: tf,
            zb: b.zb,
            zt: b.zt,
            gx: b.gx,
            gy: b.gy,
            gw: b.gw,
            gh: b.gh,
        };
    }
    let bytes = (n * core::mem::size_of::<GpuBlock>()) as u32;
    gpu_add_bytes_uploaded(bytes);
    bytes
}

/// Calcula los bytes a subir y empaqueta únicamente los bloques sucios en GPU_STAGE.
/// Si range es nulo o no hay modificaciones, devuelve 0.
#[no_mangle]
pub unsafe extern "C" fn gpu_upload_dirty(range: *const DirtyRange) -> u32 {
    if range.is_null() {
        return 0;
    }
    let r = &*range;
    if r.cell_min >= r.cell_max {
        return 0;
    }
    let mut bytes = 0u32;
    let c0 = (r.cell_min as usize).min(NCELL);
    let c1 = (r.cell_max as usize).min(NCELL);
    for ci in c0..c1 {
        let mut bi = HEAD[ci];
        while bi != 0 {
            let idx = (bi - 1) as usize;
            if idx < POOL {
                let b = &BL.data[idx];
                let tf = (b.tex as u32) | ((b.flags as u32) << 8) | ((b.ao as u32) << 16);
                GPU_STAGE[idx] = GpuBlock {
                    cell: b.next,
                    tex_flags: tf,
                    zb: b.zb,
                    zt: b.zt,
                    gx: b.gx,
                    gy: b.gy,
                    gw: b.gw,
                    gh: b.gh,
                };
                bytes = bytes.saturating_add(core::mem::size_of::<GpuBlock>() as u32);
            }
            bi = BL.data[idx].next;
        }
    }
    gpu_add_bytes_uploaded(bytes);
    bytes
}

/// Devuelve el total de bytes subidos acumulados.
#[no_mangle]
pub extern "C" fn gpu_upload_total_bytes() -> u32 {
    gpu_bytes_uploaded()
}
