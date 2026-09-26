//! Pool estático de memoria fija con free-list indexada por u32 (1-based).
#![allow(dead_code)]

#[repr(C)]
pub struct Pool<T: Copy + Default, const N: usize> {
    pub data: [T; N],
    pub next_free: [u32; N],   // 1-based; 0 = fin
    pub free_head: u32,
    pub used: u32,             // cota superior de índices alcanzados
    pub live: u32,
}

impl<T: Copy + Default, const N: usize> Pool<T, N> {
    pub const fn new(default: T) -> Self {
        Self {
            data: [default; N],
            next_free: [0; N],
            free_head: 0,
            used: 0,
            live: 0,
        }
    }

    #[inline(always)]
    pub fn alloc(&mut self) -> Option<u32> {
        if self.free_head != 0 {
            let i = self.free_head;
            self.free_head = self.next_free[(i - 1) as usize];
            self.next_free[(i - 1) as usize] = 0;
            self.live += 1;
            Some(i)
        } else if (self.used as usize) < N {
            self.used += 1;
            self.live += 1;
            Some(self.used)
        } else {
            None
        }
    }

    #[inline(always)]
    pub fn free(&mut self, idx: u32) {
        if idx == 0 || idx > self.used { return; }
        self.data[(idx - 1) as usize] = T::default();
        self.next_free[(idx - 1) as usize] = self.free_head;
        self.free_head = idx;
        self.live -= 1;
    }

    /// Un índice fuera de 1..=used es un error de programa: se detiene con una trampa de WASM (que JS captura) en vez
    /// de leer memoria ajena, como pasaba con `idx = 0` (0 − 1 se convertía en u32::MAX).
    #[inline(always)]
    pub fn get(&self, idx: u32) -> &T {
        assert!(idx != 0 && idx <= self.used);
        &self.data[(idx - 1) as usize]
    }

    #[inline(always)]
    pub fn get_mut(&mut self, idx: u32) -> &mut T {
        assert!(idx != 0 && idx <= self.used);
        &mut self.data[(idx - 1) as usize]
    }

    #[inline(always)]
    pub fn reset(&mut self) {
        self.free_head = 0;
        self.used = 0;
        self.live = 0;
    }
}

impl<T: Copy + Default, const N: usize> core::ops::Deref for Pool<T, N> {
    type Target = [T; N];
    #[inline(always)]
    fn deref(&self) -> &Self::Target {
        &self.data
    }
}

impl<T: Copy + Default, const N: usize> core::ops::DerefMut for Pool<T, N> {
    #[inline(always)]
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.data
    }
}

#[macro_export]
macro_rules! pool_alloc {
    ($p:expr) => {
        $p.alloc()
    };
}

#[macro_export]
macro_rules! pool_free {
    ($p:expr, $i:expr) => {
        $p.free($i)
    };
}
