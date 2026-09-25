//! Arquitectura ECS en SoA (Structure of Arrays) para entidades, proyectiles, flashes y partículas.
#![allow(dead_code)]
#![allow(static_mut_refs)]

use crate::contracts::EntityId;

pub const MAX_ENT: usize = 2048;
pub const MAX_PRJ: usize = 512;
pub const MAX_FLASH: usize = 16;
pub const MAX_PART: usize = 3072;

// =========================================================================
// EntitySoA
// =========================================================================
#[repr(C)]
pub struct EntitySoA {
    pub active: [u8; MAX_ENT],
    pub kind:   [u8; MAX_ENT],   // 0=imp 1=skull 2=caco
    pub state:  [u8; MAX_ENT],
    pub x: [f32; MAX_ENT], pub y: [f32; MAX_ENT], pub z: [f32; MAX_ENT],
    pub vx: [f32; MAX_ENT], pub vy: [f32; MAX_ENT], pub vz: [f32; MAX_ENT],
    pub hp: [f32; MAX_ENT], pub hurt: [f32; MAX_ENT], pub cd: [f32; MAX_ENT],
    pub wind: [f32; MAX_ENT],
    pub home_x: [f32; MAX_ENT], pub home_y: [f32; MAX_ENT], pub home_z: [f32; MAX_ENT],
    pub ph: [f32; MAX_ENT], pub lod_acc: [f32; MAX_ENT],
    pub dx: [f32; MAX_ENT], pub dy: [f32; MAX_ENT], pub dz: [f32; MAX_ENT],
    pub dead_t: [f32; MAX_ENT],
    pub t: [f32; MAX_ENT],
    pub hit: [u8; MAX_ENT],
    pub lost: [f32; MAX_ENT],
    // free-list (1-based; 0 = fin)
    pub free_head: u32,
    pub next_free: [u32; MAX_ENT],
    pub used: u32,
    pub live: u32,
}

static mut OPS_SPAWN: u32 = 0;
static mut OPS_DESTROY: u32 = 0;

#[no_mangle] pub unsafe extern "C" fn ents_ops_spawn() -> u32 { OPS_SPAWN }
#[no_mangle] pub unsafe extern "C" fn ents_ops_destroy() -> u32 { OPS_DESTROY }

impl EntitySoA {
    pub const fn new() -> Self {
        Self {
            active: [0; MAX_ENT],
            kind: [0; MAX_ENT],
            state: [0; MAX_ENT],
            x: [0.0; MAX_ENT], y: [0.0; MAX_ENT], z: [0.0; MAX_ENT],
            vx: [0.0; MAX_ENT], vy: [0.0; MAX_ENT], vz: [0.0; MAX_ENT],
            hp: [0.0; MAX_ENT], hurt: [0.0; MAX_ENT], cd: [0.0; MAX_ENT],
            wind: [0.0; MAX_ENT],
            home_x: [0.0; MAX_ENT], home_y: [0.0; MAX_ENT], home_z: [0.0; MAX_ENT],
            ph: [0.0; MAX_ENT], lod_acc: [0.0; MAX_ENT],
            dx: [0.0; MAX_ENT], dy: [0.0; MAX_ENT], dz: [0.0; MAX_ENT],
            dead_t: [0.0; MAX_ENT],
            t: [0.0; MAX_ENT],
            hit: [0; MAX_ENT],
            lost: [0.0; MAX_ENT],
            free_head: 0,
            next_free: [0; MAX_ENT],
            used: 0,
            live: 0,
        }
    }

    #[inline]
    pub fn spawn(&mut self, kind: u8, x: f32, y: f32, z: f32) -> Option<EntityId> {
        unsafe { OPS_SPAWN = OPS_SPAWN.wrapping_add(1); }
        let id = if self.free_head != 0 {
            let i = self.free_head;
            self.free_head = self.next_free[(i - 1) as usize];
            self.next_free[(i - 1) as usize] = 0;
            i
        } else if (self.used as usize) < MAX_ENT {
            self.used += 1;
            self.used
        } else {
            return None;
        };

        let idx = (id - 1) as usize;
        self.active[idx] = 1;
        self.kind[idx] = kind;
        self.state[idx] = 0;
        self.x[idx] = x;
        self.y[idx] = y;
        self.z[idx] = z;
        self.vx[idx] = 0.0;
        self.vy[idx] = 0.0;
        self.vz[idx] = 0.0;
        self.hp[idx] = match kind { 0 => 3.0, 1 => 2.0, 2 => 8.0, _ => 10.0 };
        self.hurt[idx] = 0.0;
        self.cd[idx] = 2.0;
        self.wind[idx] = 0.0;
        self.home_x[idx] = x;
        self.home_y[idx] = y;
        self.home_z[idx] = z;
        self.ph[idx] = 0.0;
        self.lod_acc[idx] = 0.0;
        self.dx[idx] = 0.0;
        self.dy[idx] = 0.0;
        self.dz[idx] = 0.0;
        self.dead_t[idx] = 0.0;
        self.t[idx] = 0.0;
        self.hit[idx] = 0;
        self.lost[idx] = 0.0;

        self.live += 1;
        Some(id)
    }

    #[inline]
    pub fn destroy(&mut self, id: EntityId) {
        if id == 0 || id > self.used { return; }
        let idx = (id - 1) as usize;
        if self.active[idx] == 0 { return; }
        unsafe { OPS_DESTROY = OPS_DESTROY.wrapping_add(1); }
        self.active[idx] = 0;
        self.next_free[idx] = self.free_head;
        self.free_head = id;
        self.live -= 1;
    }

    pub fn iter_active(&self) -> impl Iterator<Item = EntityId> + '_ {
        (1..=self.used).filter(move |&id| self.active[(id - 1) as usize] != 0)
    }

    pub fn reset(&mut self) {
        self.active = [0; MAX_ENT];
        self.free_head = 0;
        self.used = 0;
        self.live = 0;
        unsafe {
            OPS_SPAWN = 0;
            OPS_DESTROY = 0;
        }
    }
}

// =========================================================================
// ProjectilesSoA
// =========================================================================
#[repr(C)]
pub struct ProjectilesSoA {
    pub active: [u8; MAX_PRJ],
    pub kind:   [u8; MAX_PRJ],
    pub x: [f32; MAX_PRJ], pub y: [f32; MAX_PRJ], pub z: [f32; MAX_PRJ],
    pub vx: [f32; MAX_PRJ], pub vy: [f32; MAX_PRJ], pub vz: [f32; MAX_PRJ],
    pub dmg: [f32; MAX_PRJ],
    pub life: [f32; MAX_PRJ],
    pub free_head: u32,
    pub next_free: [u32; MAX_PRJ],
    pub used: u32,
    pub live: u32,
}

impl ProjectilesSoA {
    pub const fn new() -> Self {
        Self {
            active: [0; MAX_PRJ],
            kind: [0; MAX_PRJ],
            x: [0.0; MAX_PRJ], y: [0.0; MAX_PRJ], z: [0.0; MAX_PRJ],
            vx: [0.0; MAX_PRJ], vy: [0.0; MAX_PRJ], vz: [0.0; MAX_PRJ],
            dmg: [0.0; MAX_PRJ],
            life: [0.0; MAX_PRJ],
            free_head: 0,
            next_free: [0; MAX_PRJ],
            used: 0,
            live: 0,
        }
    }

    #[inline]
    pub fn spawn(&mut self, kind: u8, x: f32, y: f32, z: f32, vx: f32, vy: f32, vz: f32, dmg: f32, life: f32) -> Option<u32> {
        let id = if self.free_head != 0 {
            let i = self.free_head;
            self.free_head = self.next_free[(i - 1) as usize];
            self.next_free[(i - 1) as usize] = 0;
            i
        } else if (self.used as usize) < MAX_PRJ {
            self.used += 1;
            self.used
        } else {
            return None;
        };

        let idx = (id - 1) as usize;
        self.active[idx] = 1;
        self.kind[idx] = kind;
        self.x[idx] = x;
        self.y[idx] = y;
        self.z[idx] = z;
        self.vx[idx] = vx;
        self.vy[idx] = vy;
        self.vz[idx] = vz;
        self.dmg[idx] = dmg;
        self.life[idx] = life;

        self.live += 1;
        Some(id)
    }

    #[inline]
    pub fn destroy(&mut self, id: u32) {
        if id == 0 || id > self.used { return; }
        let idx = (id - 1) as usize;
        if self.active[idx] == 0 { return; }
        self.active[idx] = 0;
        self.next_free[idx] = self.free_head;
        self.free_head = id;
        self.live -= 1;
    }

    pub fn iter_active(&self) -> impl Iterator<Item = u32> + '_ {
        (1..=self.used).filter(move |&id| self.active[(id - 1) as usize] != 0)
    }

    pub fn reset(&mut self) {
        self.active = [0; MAX_PRJ];
        self.free_head = 0;
        self.used = 0;
        self.live = 0;
    }
}

// =========================================================================
// FlashesSoA
// =========================================================================
#[repr(C)]
pub struct FlashesSoA {
    pub active: [u8; MAX_FLASH],
    pub x: [f32; MAX_FLASH], pub y: [f32; MAX_FLASH], pub z: [f32; MAX_FLASH],
    pub r: [f32; MAX_FLASH], pub g: [f32; MAX_FLASH], pub b: [f32; MAX_FLASH],
    pub rad: [f32; MAX_FLASH], pub int: [f32; MAX_FLASH], pub decay: [f32; MAX_FLASH],
    pub free_head: u32,
    pub next_free: [u32; MAX_FLASH],
    pub used: u32,
    pub live: u32,
}

impl FlashesSoA {
    pub const fn new() -> Self {
        Self {
            active: [0; MAX_FLASH],
            x: [0.0; MAX_FLASH], y: [0.0; MAX_FLASH], z: [0.0; MAX_FLASH],
            r: [0.0; MAX_FLASH], g: [0.0; MAX_FLASH], b: [0.0; MAX_FLASH],
            rad: [0.0; MAX_FLASH], int: [0.0; MAX_FLASH], decay: [0.0; MAX_FLASH],
            free_head: 0,
            next_free: [0; MAX_FLASH],
            used: 0,
            live: 0,
        }
    }

    #[inline]
    pub fn spawn(&mut self, x: f32, y: f32, z: f32, r: f32, g: f32, b: f32, rad: f32, int: f32, decay: f32) -> Option<u32> {
        let id = if self.free_head != 0 {
            let i = self.free_head;
            self.free_head = self.next_free[(i - 1) as usize];
            self.next_free[(i - 1) as usize] = 0;
            i
        } else if (self.used as usize) < MAX_FLASH {
            self.used += 1;
            self.used
        } else {
            return None;
        };

        let idx = (id - 1) as usize;
        self.active[idx] = 1;
        self.x[idx] = x;
        self.y[idx] = y;
        self.z[idx] = z;
        self.r[idx] = r;
        self.g[idx] = g;
        self.b[idx] = b;
        self.rad[idx] = rad;
        self.int[idx] = int;
        self.decay[idx] = decay;

        self.live += 1;
        Some(id)
    }

    #[inline]
    pub fn destroy(&mut self, id: u32) {
        if id == 0 || id > self.used { return; }
        let idx = (id - 1) as usize;
        if self.active[idx] == 0 { return; }
        self.active[idx] = 0;
        self.next_free[idx] = self.free_head;
        self.free_head = id;
        self.live -= 1;
    }

    pub fn iter_active(&self) -> impl Iterator<Item = u32> + '_ {
        (1..=self.used).filter(move |&id| self.active[(id - 1) as usize] != 0)
    }

    pub fn reset(&mut self) {
        self.active = [0; MAX_FLASH];
        self.free_head = 0;
        self.used = 0;
        self.live = 0;
    }
}

// =========================================================================
// ParticlesSoA
// =========================================================================
#[repr(C)]
pub struct ParticlesSoA {
    pub active: [u8; MAX_PART],
    pub x: [f32; MAX_PART], pub y: [f32; MAX_PART], pub z: [f32; MAX_PART],
    pub vx: [f32; MAX_PART], pub vy: [f32; MAX_PART], pub vz: [f32; MAX_PART],
    pub col: [u32; MAX_PART],
    pub life: [f32; MAX_PART],
    pub max_life: [f32; MAX_PART],
    pub seq: [u32; MAX_PART],
    pub free_head: u32,
    pub next_free: [u32; MAX_PART],
    pub used: u32,
    pub live: u32,
}

impl ParticlesSoA {
    pub const fn new() -> Self {
        Self {
            active: [0; MAX_PART],
            x: [0.0; MAX_PART], y: [0.0; MAX_PART], z: [0.0; MAX_PART],
            vx: [0.0; MAX_PART], vy: [0.0; MAX_PART], vz: [0.0; MAX_PART],
            col: [0; MAX_PART],
            life: [0.0; MAX_PART],
            max_life: [0.0; MAX_PART],
            seq: [0; MAX_PART],
            free_head: 0,
            next_free: [0; MAX_PART],
            used: 0,
            live: 0,
        }
    }

    #[inline]
    pub fn spawn(&mut self, x: f32, y: f32, z: f32, vx: f32, vy: f32, vz: f32, col: u32, life: f32, seq: u32) -> Option<u32> {
        let id = if self.free_head != 0 {
            let i = self.free_head;
            self.free_head = self.next_free[(i - 1) as usize];
            self.next_free[(i - 1) as usize] = 0;
            i
        } else if (self.used as usize) < MAX_PART {
            self.used += 1;
            self.used
        } else {
            return None;
        };

        let idx = (id - 1) as usize;
        self.active[idx] = 1;
        self.x[idx] = x;
        self.y[idx] = y;
        self.z[idx] = z;
        self.vx[idx] = vx;
        self.vy[idx] = vy;
        self.vz[idx] = vz;
        self.col[idx] = col;
        self.life[idx] = life;
        self.max_life[idx] = life;
        self.seq[idx] = seq;

        self.live += 1;
        Some(id)
    }

    #[inline]
    pub fn destroy(&mut self, id: u32) {
        if id == 0 || id > self.used { return; }
        let idx = (id - 1) as usize;
        if self.active[idx] == 0 { return; }
        self.active[idx] = 0;
        self.next_free[idx] = self.free_head;
        self.free_head = id;
        self.live -= 1;
    }

    pub fn iter_active(&self) -> impl Iterator<Item = u32> + '_ {
        (1..=self.used).filter(move |&id| self.active[(id - 1) as usize] != 0)
    }

    pub fn reset(&mut self) {
        self.active = [0; MAX_PART];
        self.free_head = 0;
        self.used = 0;
        self.live = 0;
    }
}

// =========================================================================
// ItemsSoA
// =========================================================================
pub const MAX_ITEM: usize = 512;

#[repr(C)]
pub struct ItemsSoA {
    pub active: [u8; MAX_ITEM],
    pub kind:   [u8; MAX_ITEM], // 0=ammo 1=health 2=armor 3=weapon 4=crate 5=beacon
    pub x: [f32; MAX_ITEM], pub y: [f32; MAX_ITEM], pub z: [f32; MAX_ITEM],
    pub vx: [f32; MAX_ITEM], pub vy: [f32; MAX_ITEM], pub vz: [f32; MAX_ITEM],
    pub ground: [u8; MAX_ITEM],
    pub free_head: u32,
    pub next_free: [u32; MAX_ITEM],
    pub used: u32,
    pub live: u32,
}

impl ItemsSoA {
    pub const fn new() -> Self {
        Self {
            active: [0; MAX_ITEM],
            kind: [0; MAX_ITEM],
            x: [0.0; MAX_ITEM], y: [0.0; MAX_ITEM], z: [0.0; MAX_ITEM],
            vx: [0.0; MAX_ITEM], vy: [0.0; MAX_ITEM], vz: [0.0; MAX_ITEM],
            ground: [0; MAX_ITEM],
            free_head: 0,
            next_free: [0; MAX_ITEM],
            used: 0,
            live: 0,
        }
    }

    #[inline]
    pub fn spawn(&mut self, kind: u8, x: f32, y: f32, z: f32, vx: f32, vy: f32, vz: f32, ground: u8) -> Option<u32> {
        let id = if self.free_head != 0 {
            let i = self.free_head;
            self.free_head = self.next_free[(i - 1) as usize];
            self.next_free[(i - 1) as usize] = 0;
            i
        } else if (self.used as usize) < MAX_ITEM {
            self.used += 1;
            self.used
        } else {
            return None;
        };

        let idx = (id - 1) as usize;
        self.active[idx] = 1;
        self.kind[idx] = kind;
        self.x[idx] = x;
        self.y[idx] = y;
        self.z[idx] = z;
        self.vx[idx] = vx;
        self.vy[idx] = vy;
        self.vz[idx] = vz;
        self.ground[idx] = ground;

        self.live += 1;
        Some(id)
    }

    #[inline]
    pub fn destroy(&mut self, id: u32) {
        if id == 0 || id > self.used { return; }
        let idx = (id - 1) as usize;
        if self.active[idx] == 0 { return; }
        self.active[idx] = 0;
        self.next_free[idx] = self.free_head;
        self.free_head = id;
        self.live -= 1;
    }

    pub fn iter_active(&self) -> impl Iterator<Item = u32> + '_ {
        (1..=self.used).filter(move |&id| self.active[(id - 1) as usize] != 0)
    }

    pub fn reset(&mut self) {
        self.active = [0; MAX_ITEM];
        self.free_head = 0;
        self.used = 0;
        self.live = 0;
    }
}

// =========================================================================
// Estancias globales y punteros C-ABI
// =========================================================================
pub static mut ENTS: EntitySoA = EntitySoA::new();
pub static mut PRJS: ProjectilesSoA = ProjectilesSoA::new();
pub static mut FLASHES: FlashesSoA = FlashesSoA::new();
pub static mut PARTS: ParticlesSoA = ParticlesSoA::new();
pub static mut ITEMS: ItemsSoA = ItemsSoA::new();

#[no_mangle] pub extern "C" fn ents_ptr() -> *const EntitySoA { unsafe { &ENTS as *const _ } }
#[no_mangle] pub extern "C" fn prjs_ptr() -> *const ProjectilesSoA { unsafe { &PRJS as *const _ } }
#[no_mangle] pub extern "C" fn flashes_ptr() -> *const FlashesSoA { unsafe { &FLASHES as *const _ } }
#[no_mangle] pub extern "C" fn parts_ptr() -> *const ParticlesSoA { unsafe { &PARTS as *const _ } }
#[no_mangle] pub extern "C" fn items_ptr() -> *const ItemsSoA { unsafe { &ITEMS as *const _ } }
