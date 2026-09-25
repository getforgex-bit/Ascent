//! Instrumentación y profiling en Rust para FORGEX DOOM Orbital.
//! Macros prof_begin! y prof_end! para medir el tiempo CPU Rust por sección.

pub const PROF_WORLD: usize = 0;
pub const PROF_LIGHT: usize = 1;
pub const PROF_SIM: usize = 2;
pub const PROF_AI: usize = 3;
pub const PROF_SPRITES: usize = 4;
pub const PROF_UPLOAD: usize = 5;
pub const PROF_PRESENT: usize = 6;
pub const PROF_N: usize = 7;

static mut ACC: [f32; PROF_N] = [0.0; PROF_N];
static mut START: [f32; PROF_N] = [0.0; PROF_N];

extern "C" {
    fn now_import() -> f32;
}

#[inline(always)]
pub unsafe fn begin(slot: usize) {
    if slot < PROF_N {
        START[slot] = now_import();
    }
}

#[inline(always)]
pub unsafe fn end(slot: usize) {
    if slot < PROF_N {
        ACC[slot] += now_import() - START[slot];
    }
}

#[macro_export]
macro_rules! prof_begin {
    ($slot:expr) => {
        unsafe {
            $crate::prof::begin($slot);
        }
    };
}

#[macro_export]
macro_rules! prof_end {
    ($slot:expr) => {
        unsafe {
            $crate::prof::end($slot);
        }
    };
}

#[no_mangle]
pub unsafe extern "C" fn prof_drain(out: *mut f32, n: usize) -> u32 {
    if out.is_null() {
        return 0;
    }
    let count = n.min(PROF_N);
    for i in 0..count {
        *out.add(i) = ACC[i];
        ACC[i] = 0.0;
    }
    count as u32
}

#[no_mangle]
pub unsafe extern "C" fn test_prof_record(slot: usize, ms: f32) {
    if slot < PROF_N {
        ACC[slot] += ms;
    }
}

static mut DRAIN_BUF: [f32; PROF_N] = [0.0; PROF_N];

#[no_mangle]
pub unsafe extern "C" fn prof_buf() -> *mut f32 {
    DRAIN_BUF.as_mut_ptr()
}
