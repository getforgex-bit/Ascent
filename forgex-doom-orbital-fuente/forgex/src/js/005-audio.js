  // ================= AUDIO (generado, sin archivos) =================
  let AC = null, master = null, noiseBuf = null, muted = false;
  function audioInit() {
    if (AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = .55; master.connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150;
      const g = AC.createGain(); g.gain.value = .045; f.connect(g); g.connect(master);
      for (const fr of [41, 41.7, 61.8]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); }
      const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .06; lg.gain.value = 70; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    } catch (_) { AC = null; }
  }
  function tone(f, f2, dur, vol, type = 'sine', delay = 0) {
    if (!AC || muted || vol < .003) return;
    const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur, vol, freq = 1000, type = 'lowpass', f2, delay = 0) {
    if (!AC || muted || vol < .003) return;
    const t = AC.currentTime + delay, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  const SFX = {
    plasma: () => { tone(1100, 180, .14, .1, 'square'); noise(.08, .07, 3000, 'highpass'); },
    escopeta: () => { noise(.42, .35, 1400, 'lowpass', 180); tone(120, 40, .25, .3); },
    riel: () => { tone(1800, 90, .55, .14, 'sawtooth'); noise(.3, .12, 4000, 'highpass'); },
    empty: () => tone(180, 160, .06, .1, 'square'),
    impWind: v => tone(260, 900, .6, .13 * v, 'triangle'),
    toss: v => noise(.35, .14 * v, 600, 'bandpass', 2000),
    skullTele: v => tone(700, 1500, .5, .1 * v, 'sawtooth'),
    skullDash: v => noise(.5, .2 * v, 400, 'bandpass', 1500),
    cacoTele: v => tone(110, 260, .9, .16 * v, 'sawtooth'),
    chaser: small => small ? (tone(900, 1700, .35, .09, 'square'), tone(1300, 2300, .3, .05, 'square', .12))
      : (tone(95, 60, 1.1, .16, 'sawtooth'), noise(.9, .08, 300, 'bandpass', 120)),
    chaserBite: v => { noise(.18, .2 * v, 1200, 'bandpass', 400); tone(160, 70, .2, .12 * v, 'square'); },
    chaserFade: v => tone(520, 90, .7, .06 * v, 'triangle'),
    shield: () => { tone(1250, 1250, .5, .1); tone(1870, 1870, .5, .06); },
    block: () => { tone(2400, 900, .2, .15, 'triangle'); noise(.12, .15, 5000, 'highpass'); },
    hurt: () => { noise(.2, .25, 500); tone(95, 50, .25, .25); },
    pick: () => tone(660, 990, .12, .1),
    denied: () => { tone(220, 200, .12, .09, 'square'); tone(180, 160, .12, .07, 'square', .11); },
    emptyCrate: () => { tone(110, 70, .4, .2, 'triangle'); noise(.25, .1, 300); },
    open: () => { noise(.25, .15, 900, 'bandpass', 300); tone(300, 180, .2, .06, 'square'); },
    die: v => { tone(320, 50, .6, .18 * v, 'sawtooth'); noise(.5, .15 * v, 700); },
    fall: () => tone(400, 60, 1.2, .2, 'sawtooth'),
    heart: () => { tone(62, 45, .14, .35); tone(58, 42, .14, .28, 'sine', .22); },
    pad: () => tone(300, 1200, .4, .1, 'triangle'),
    checkpoint: () => { tone(880, 880, .08, .04); tone(1320, 1320, .1, .03, 'sine', .08); },
    distant: () => { const r = Math.random();
      if (r < .35) tone(70, 36, 2.4, .07, 'sawtooth');
      else if (r < .65) { tone(310, 270, 1.6, .025, 'triangle'); tone(460, 430, 1.4, .02, 'triangle', .3); }
      else noise(1.8, .06, 900, 'bandpass', 250); },
  };
  let st; // estado de la partida
  const volAt = (x, y, z) => st ? Math.max(0, 1 - Math.hypot(x - st.px, y - st.py, z - st.pz) / 24) : 0;

