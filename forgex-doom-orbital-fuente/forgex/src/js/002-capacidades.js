  // ================= CAPACIDADES DEL NAVEGADOR Y LA GRÁFICA =================
  // Se detectan al arrancar; el motor elige la mejor ruta disponible y el resto quedan como respaldo.
  const CAPS = {
    wasm: typeof WebAssembly === 'object',
    simd: false,
    workers: typeof Worker === 'function' && typeof Blob === 'function' && typeof URL === 'function' && !!URL.createObjectURL,
    sharedMemory: typeof SharedArrayBuffer === 'function' && !!self.crossOriginIsolated,
    cores: Math.max(1, navigator.hardwareConcurrency | 0 || 2),
    memGB: navigator.deviceMemory || 0,
    mobile: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
    webgpu: false, gpuFallback: false, gpuInfo: '', gpuTimestamps: false, gpuError: '', gpuAdapter: null,
    refresh: 60, // Hz del monitor (se estima con los primeros fotogramas)
  };
  try { // módulo mínimo con una instrucción SIMD: si valida, el navegador soporta WebAssembly SIMD
    CAPS.simd = CAPS.wasm && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (_) {}
  async function probeWebGPU() {
    try {
      if (!navigator.gpu) { CAPS.gpuError = 'el navegador no ofrece WebGPU'; return null; }
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!a) { CAPS.gpuError = 'no hay adaptador WebGPU para esta gráfica'; return null; }
      const info = a.info || {};
      CAPS.webgpu = true; CAPS.gpuAdapter = a;
      CAPS.gpuFallback = !!(a.isFallbackAdapter || info.isFallbackAdapter);
      CAPS.gpuInfo = [info.vendor, info.architecture, info.description].filter(Boolean).join(' · ') || 'adaptador WebGPU';
      CAPS.gpuTimestamps = a.features.has('timestamp-query');
      return a;
    } catch (e) { CAPS.gpuError = String(e && e.message || e); return null; }
  }
  // preset inicial razonable según el equipo (el jugador puede cambiarlo después)
  function autoPresetFor(backend) {
    if (backend === 'webgpu') return CAPS.mobile ? 'media' : 'alta';
    if (CAPS.mobile || CAPS.cores <= 2 || (CAPS.memGB && CAPS.memGB < 4)) return backend === 'js' ? 'rendimiento' : 'baja';
    if (backend === 'js') return 'baja';
    return CAPS.cores >= 6 ? 'alta' : 'media';
  }
