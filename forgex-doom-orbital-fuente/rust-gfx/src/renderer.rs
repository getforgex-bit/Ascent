//! Estado del motor WebGPU y gestión de triple buffering (Rust/WASM).
#![allow(static_mut_refs)]

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct GpuState {
    pub adapter_ok: bool,
    pub device_ok: bool,
    pub frame: u32,
    pub slot_free: u32,
    pub bytes_uploaded: u32,
}

pub static mut GPU: GpuState = GpuState {
    adapter_ok: false,
    device_ok: false,
    frame: 0,
    slot_free: 1, // slot (0 + 1) % 3
    bytes_uploaded: 0,
};

/// Devuelve el índice de slot libre para el fotograma en curso (0, 1 o 2).
#[no_mangle]
pub extern "C" fn gpu_begin_frame() -> u32 {
    unsafe { GPU.slot_free }
}

/// Avanza el contador de fotogramas y rota al siguiente slot libre en triple buffering.
#[no_mangle]
pub extern "C" fn gpu_end_frame() {
    unsafe {
        GPU.frame = GPU.frame.wrapping_add(1);
        GPU.slot_free = (GPU.frame + 1) % 3;
    }
}

/// Bytes totales subidos a la GPU en el fotograma o ciclo actual.
#[no_mangle]
pub extern "C" fn gpu_bytes_uploaded() -> u32 {
    unsafe { GPU.bytes_uploaded }
}

/// Añade bytes al contador de subida.
#[no_mangle]
pub extern "C" fn gpu_add_bytes_uploaded(bytes: u32) {
    unsafe {
        GPU.bytes_uploaded = GPU.bytes_uploaded.saturating_add(bytes);
    }
}

/// Reinicia el contador de bytes subidos.
#[no_mangle]
pub extern "C" fn gpu_reset_bytes_uploaded() -> u32 {
    unsafe {
        let prev = GPU.bytes_uploaded;
        GPU.bytes_uploaded = 0;
        prev
    }
}

/// Establece el estado del adaptador y dispositivo WebGPU.
#[no_mangle]
pub extern "C" fn gpu_set_status(adapter_ok: u32, device_ok: u32) {
    unsafe {
        GPU.adapter_ok = adapter_ok != 0;
        GPU.device_ok = device_ok != 0;
    }
}

/// Consulta si el dispositivo GPU está listo.
#[no_mangle]
pub extern "C" fn gpu_is_ready() -> u32 {
    unsafe {
        if GPU.adapter_ok && GPU.device_ok { 1 } else { 0 }
    }
}

static mut DEVICE_LOST: u32 = 0;

#[no_mangle]
pub unsafe extern "C" fn gpu_mark_lost(reason: u32) {
    DEVICE_LOST = reason;
}

#[no_mangle]
pub unsafe extern "C" fn gpu_is_lost() -> u32 {
    DEVICE_LOST
}
