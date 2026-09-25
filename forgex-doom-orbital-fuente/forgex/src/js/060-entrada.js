  // ================= ENTRADA =================
  const keys = {}; let mdx = 0, mdy = 0, fireHeld = false, jumpReq = false, paused = false;
  const pauseBtn = document.getElementById('pause-btn');
  let pauseWhy = '';
  const qBtn = document.getElementById('quality-btn');
  const qLabel = () => { qBtn.textContent = `Calidad: ${QUALITIES[quality][0]} (G)`; };
  function cycleQuality() { setOption('graphics', 'quality', (quality + 1) % QUALITIES.length); msg(`Resolución: ${QUALITIES[quality][0].toLowerCase()} (${RW}×${RH}).`); }
  qBtn.addEventListener('click', () => { cycleQuality(); view.focus(); });
  qLabel();
  function setPause(v, why = '') {
    if (v && (!started || st.dead)) return;
    pauseWhy = why;
    paused = v; fireHeld = false; jumpReq = false; for (const k in keys) keys[k] = false;
    pauseBtn.setAttribute('aria-pressed', String(v)); pauseBtn.textContent = v ? '▶ Continuar (P)' : '❚❚ Pausa (P)';
    if (AC) { try { v ? AC.suspend() : AC.resume(); } catch (_) {} }
    if (v && document.pointerLockElement === view) { try { document.exitPointerLock(); } catch (_) {} }
  }
  pauseBtn.addEventListener('click', () => { setPause(!paused); if (!paused) view.focus(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== view && started && !st.dead && !paused) setPause(true, 'Se soltó el mouse (Esc o cambio de ventana).'); });
  document.addEventListener('pointerlockerror', () => msg('El navegador no dejó capturar el mouse. Espera un segundo y haz clic otra vez.', '#ffb347'));
  const clearInput = () => { for (const k in keys) keys[k] = false; fireHeld = false; jumpReq = false; };
  addEventListener('blur', () => { clearInput(); if (started && !st.dead && !paused) setPause(true, 'La ventana perdió el foco.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (started && !st.dead && !paused) setPause(true, 'Cambiaste de pestaña.'); } });
  const begin = () => { started = true; audioInit(); if (AC && AC.state === 'suspended') AC.resume(); };
  function useShield() {
    if (!st.inv.some(i => i.t === 'shield')) return denied('No llevas escudo.');
    if (st.shieldCd > 0) { SFX.denied(); return; }
    st.shieldT = .6; st.shieldCd = st.shieldRecharge; SFX.shield();
  }
  function useE() { if (st.near) interact(st.near); }
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) setPause(!paused); return; }
    if (paused) return;
    const first = !keys[e.code]; keys[e.code] = true; begin();
    if (st.dead) { if (e.code === 'KeyR') reset(); return; }
    if (!first) return;
    if (e.code === 'Space') jumpReq = true;
    if (e.code === 'KeyF') fireHeld = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') useShield();
    if (e.code === 'KeyE') useE();
    if (e.code === 'KeyQ') dropSelected();
    if (e.code === 'KeyC') st.look = 0;
    if (e.code === 'KeyL') { st.lamp = !st.lamp; msg(st.lamp ? 'Linterna encendida.' : 'Linterna apagada.'); }
    if (e.code === 'KeyG') cycleQuality();
    if (e.code === 'KeyT') { if (BACKEND === 'js') msg('El trazado de rayos necesita el motor Rust o WebGPU.', '#ffb347'); else { setOption('rt', 'mode', (CFG.rt.mode + 1) % 4); msg(`Trazado de rayos: ${RT_NAMES[CFG.rt.mode]}${EFF.rt < CFG.rt.mode ? ' (AUTO lo está recortando ahora)' : ''}.`); } }
    if (e.code === 'KeyM') { muted = !muted; msg(muted ? 'Sonido apagado.' : 'Sonido encendido.'); }
    const dg = /^Digit([1-6])$/.exec(e.code); if (dg) selectSlot(+dg[1] - 1);
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyF') fireHeld = false; });
  view.addEventListener('contextmenu', e => e.preventDefault());
  view.addEventListener('mousedown', e => {
    begin(); view.focus();
    if (paused) setPause(false);
    if (document.pointerLockElement !== view) { try { const p = view.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} return; }
    if (st.dead) return;
    if (e.button === 0) fireHeld = true;
    if (e.button === 2) useShield();
  });
  addEventListener('mouseup', e => { if (e.button === 0) fireHeld = false; });
  view.addEventListener('wheel', e => { if (document.pointerLockElement === view) { e.preventDefault(); selectSlot(st.sel + Math.sign(e.deltaY)); } }, { passive: false });
  addEventListener('mousemove', e => { if (document.pointerLockElement === view) { mdx += e.movementX; mdy += e.movementY; } });
  let drag = null;
  view.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { drag = { x: e.clientX, y: e.clientY }; begin(); view.setPointerCapture(e.pointerId); } });
  view.addEventListener('pointermove', e => { if (!drag || paused) return; const k = 960 / view.clientWidth;
    mdx += (e.clientX - drag.x) * k * 1.4; mdy += (e.clientY - drag.y) * k * 1.4; drag = { x: e.clientX, y: e.clientY }; });
  for (const ev of ['pointerup', 'pointercancel']) view.addEventListener(ev, () => { drag = null; });
  view.style.touchAction = 'none';
  document.querySelectorAll('.touch [data-k]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); keys[b.dataset.k] = true; begin(); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { keys[b.dataset.k] = false; });
  });
  const tap = (id, fn) => document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); if (paused) return; begin(); if (st.dead) { reset(); return; } fn(); });
  document.getElementById('t-pause').addEventListener('pointerdown', e => { e.preventDefault(); if (started) setPause(!paused); });
  tap('t-jump', () => { jumpReq = true; }); tap('t-shield', useShield); tap('t-use', useE); tap('t-drop', dropSelected); tap('t-next', () => selectSlot(st.sel + 1));
  tap('t-fire', () => { fireHeld = true; });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) document.getElementById('t-fire').addEventListener(ev, () => { fireHeld = false; });

