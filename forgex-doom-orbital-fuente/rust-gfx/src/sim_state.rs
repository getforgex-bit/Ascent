//! Estado congelado de simulación (SimState).
#![allow(dead_code)]
#![allow(static_mut_refs)]

#[repr(C)]
#[derive(Clone, Copy)]
pub struct SimState {
    pub px: f32, pub py: f32, pub pz: f32,
    pub vz: f32, pub pa: f32, pub look: f32,
    pub ground: u32, pub jumps: u32, pub stuck: f32,
    pub kx: f32, pub ky: f32,
    pub hp: f32, pub reserve: f32, pub heal_lock: f32,
    pub regen_n: u32, pub regen_t: f32, pub regen_idle: f32,
    pub regen_pend: u32, pub regen_drip: f32,
    pub cp_x: f32, pub cp_y: f32, pub cp_z: f32,
    pub top: f32, pub dead: u32,
    pub shield_t: f32, pub shield_cd: f32,
    pub shield_recharge: f32,
    pub jump_mul: f32, pub max_hp: f32, pub reserve_max: f32,
}

pub static mut SIM: SimState = SimState {
    px: 266.5, py: 266.5, pz: 0.0,
    vz: 0.0, pa: 0.0, look: 0.0,
    ground: 1, jumps: 0, stuck: 0.0,
    kx: 0.0, ky: 0.0,
    hp: 100.0, reserve: 30.0, heal_lock: 0.0,
    regen_n: 0, regen_t: 0.0, regen_idle: 0.0,
    regen_pend: 0, regen_drip: 0.0,
    cp_x: 266.5, cp_y: 266.5, cp_z: 0.0,
    top: 0.0, dead: 0,
    shield_t: 0.0, shield_cd: 0.0,
    shield_recharge: 60.0,
    jump_mul: 1.0, max_hp: 100.0, reserve_max: 60.0,
};

#[no_mangle]
pub extern "C" fn sim_state() -> *mut SimState {
    unsafe { &mut SIM }
}

#[no_mangle]
pub unsafe extern "C" fn sim_reset() {
    SIM = SimState {
        px: 266.5, py: 266.5, pz: 0.0,
        vz: 0.0, pa: 0.0, look: 0.0,
        ground: 1, jumps: 0, stuck: 0.0,
        kx: 0.0, ky: 0.0,
        hp: 100.0, reserve: 30.0, heal_lock: 0.0,
        regen_n: 0, regen_t: 0.0, regen_idle: 0.0,
        regen_pend: 0, regen_drip: 0.0,
        cp_x: 266.5, cp_y: 266.5, cp_z: 0.0,
        top: 0.0, dead: 0,
        shield_t: 0.0, shield_cd: 0.0,
        shield_recharge: 60.0,
        jump_mul: 1.0, max_hp: 100.0, reserve_max: 60.0,
    };
}

#[no_mangle]
pub unsafe extern "C" fn sim_set_player(px: f32, py: f32, pz: f32, pa: f32, look: f32, hp: f32, reserve: f32) {
    SIM.px = px;
    SIM.py = py;
    SIM.pz = pz;
    SIM.pa = pa;
    SIM.look = look;
    SIM.hp = hp;
    SIM.reserve = reserve;
    SIM.cp_x = px;
    SIM.cp_y = py;
    SIM.cp_z = pz;
    SIM.vz = 0.0;
    SIM.kx = 0.0;
    SIM.ky = 0.0;
}
