  // ================= WEBGPU =================
  // Ruta gráfica acelerada por hardware: shaders WGSL para renderizado y presentación.
  // Triple buffering sincronizado con Rust (renderer.rs), subida diferencial (gpu_upload.rs).
  let GPUB = {
    adapter: null,
    device: null,
    queue: null,
    canvas: null,
    ctx: null,
    format: 'bgra8unorm',
    ready: false,
    bytes: 0,
    atlasUploaded: false,
    worldUploaded: false,
    
    // Shaders
    composeVertModule: null,
    composeFragModule: null,
    atlasUploadModule: null,
    raycastModule: null,
    spriteModule: null,
    lightModule: null,
    rtShadowModule: null,
    bloomModule: null,
    
    // Bind group layouts
    bglUniforms: null,
    bglWorld: null,
    bglAtlas: null,
    bglGroup3Compute: null,
    bglGroup3Render: null,
    
    // Pipelines
    composePipeline: null,
    atlasUploadPipeline: null,
    raycastPipeline: null,
    spritePipeline: null,
    lightPipeline: null,
    rtShadowPipeline: null,
    bloomPipeline: null,
    
    // Texturas y vistas
    atlasTexture: null,
    atlasStorageView: null,
    atlasSampledView: null,
    atlasStagingBuffer: null,
    atlasStagingHost: null,
    
    // Buffers de almacenamiento persistentes
    blocksBuffer: null,
    cellHeadBuffer: null,
    czBuffer: null,
    chunkStateBuffer: null,
    spritesBuffer: null,
    lightsBuffer: null,
    shadowsBuffer: null,
    
    // Triple buffering (slots 0, 1, 2)
    uniformBuffers: [null, null, null],
    uniformBindGroups: [null, null, null],
    gbufBuffers: [null, null, null],
    lightBufBuffers: [null, null, null],
    bloomBufBuffers: [null, null, null],
    group3ComputeBindGroups: [null, null, null],
    group3RenderBindGroups: [null, null, null],
    
    // Bind groups estáticos
    worldBindGroup: null,
    atlasBindGroup: null,
    atlasUploadBindGroups: null,
    
    // Buffers de datos para uniforms y entidades
    uniformF32: new Float32Array(32),
    uniformU32: null,
    shadowsHostF32: new Float32Array(64 * 8),
    spritesHost: new ArrayBuffer(512 * 32),
    spritesU32: null,
    spritesF32: null,
    
    // Timestamps
    hasTimestamps: false,
    querySet: null,
    resolveBuffer: null,
    readBuffer: null,
    _queryReading: false,
    perf: { raycast: 0, light: 0, rt: 0, bloom: 0, compose: 0, total: 0 },
  };
  GPUB.uniformU32 = new Uint32Array(GPUB.uniformF32.buffer);
  GPUB.spritesU32 = new Uint32Array(GPUB.spritesHost);
  GPUB.spritesF32 = new Float32Array(GPUB.spritesHost);
  window.GPUB = GPUB;

  function gpuAutoOk() {
    if (!CAPS.webgpu || !navigator.gpu) return false;
    if (CAPS.gpuFallback && (!CFG.graphics || !CFG.graphics.allowSoftwareGPU)) return false;
    return true;
  }

  async function startGPU() {
    if (GPUB.ready && GPUB.device) return true;
    try {
      if (!navigator.gpu) {
        WHY.webgpu = 'el navegador no ofrece WebGPU';
        return false;
      }
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        WHY.webgpu = 'no hay adaptador WebGPU disponible';
        return false;
      }
      const info = (await adapter.requestAdapterInfo?.()) || adapter.info || {};
      const isFallback = !!(adapter.isFallbackAdapter || info.isFallbackAdapter);
      CAPS.gpuFallback = isFallback;
      CAPS.gpuInfo = [info.vendor, info.architecture, info.description].filter(Boolean).join(' · ') || 'adaptador WebGPU';
      if (isFallback && (!CFG.graphics || !CFG.graphics.allowSoftwareGPU)) {
        WHY.webgpu = 'solo adaptador por software (rechazado por configuración)';
        return false;
      }
      
      const reqFeatures = [];
      if (adapter.features.has('timestamp-query')) {
        reqFeatures.push('timestamp-query');
        GPUB.hasTimestamps = true;
      } else {
        GPUB.hasTimestamps = false;
      }

      const requiredLimits = {};
      if (adapter.limits && adapter.limits.maxStorageBuffersPerShaderStage) {
        requiredLimits.maxStorageBuffersPerShaderStage = adapter.limits.maxStorageBuffersPerShaderStage;
      }
      const device = await adapter.requestDevice({ requiredFeatures: reqFeatures, requiredLimits });
      GPUB.adapter = adapter;
      GPUB.device = device;
      GPUB.queue = device.queue;

      device.lost.then(info => {
        console.warn('Dispositivo WebGPU perdido:', info);
        WHY.webgpu = 'device perdido: ' + (info.reason || 'desconocido');
        CAPS.webgpu = false;
        GPUB.ready = false;
        if (wasm && wasm.gpu_mark_lost) wasm.gpu_mark_lost(1);
        if (wasm && wasm.gpu_set_status) wasm.gpu_set_status(0, 0);
        stopGPU();
        if (typeof setBackend === 'function') {
          setBackend('rust').then(() => {
            if (typeof msg === 'function') msg('Dispositivo WebGPU perdido; ahora dibuja Rust.', '#ffb347');
          });
        }
      });

      // Canvas y contexto WebGPU
      let gpuCanvas = document.getElementById('gpu-view');
      const curW = (typeof RW !== 'undefined' && RW) ? RW : W;
      const curH = (typeof RH !== 'undefined' && RH) ? RH : H;
      if (!gpuCanvas) {
        gpuCanvas = document.createElement('canvas');
        gpuCanvas.id = 'gpu-view';
        gpuCanvas.width = curW;
        gpuCanvas.height = curH;
        gpuCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;z-index:0';
        const screenDiv = document.querySelector('.screen') || (view && view.parentElement);
        if (screenDiv) screenDiv.insertBefore(gpuCanvas, view);
      } else {
        gpuCanvas.width = curW;
        gpuCanvas.height = curH;
      }
      GPUB.canvas = gpuCanvas;

      const format = navigator.gpu.getPreferredCanvasFormat ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';
      GPUB.format = format;
      const ctx = gpuCanvas.getContext('webgpu');
      if (!ctx) {
        WHY.webgpu = 'no se pudo obtener el contexto webgpu del canvas';
        return false;
      }
      GPUB.ctx = ctx;
      ctx.configure({
        device,
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        alphaMode: 'opaque',
      });

      // Fuentes de shaders WGSL
      const commonSrc = '@@WGSL:common@@';
      const composeVertSrc = '@@WGSL:compose.vert@@';
      const composeFragSrc = commonSrc + '\n' + '@@WGSL:compose.frag@@';
      const atlasUploadSrc = '@@WGSL:atlas_upload.comp@@';
      const raycastSrc = commonSrc + '\n' + '@@WGSL:raycast.comp@@';
      const spriteSrc = commonSrc + '\n' + '@@WGSL:sprite.comp@@';
      const lightSrc = commonSrc + '\n' + '@@WGSL:light.comp@@';
      const rtShadowSrc = commonSrc + '\n' + '@@WGSL:rt_shadow.comp@@';
      const bloomSrc = commonSrc + '\n' + '@@WGSL:bloom.comp@@';

      GPUB.composeVertModule = device.createShaderModule({ label: 'compose.vert', code: composeVertSrc });
      GPUB.composeFragModule = device.createShaderModule({ label: 'compose.frag', code: composeFragSrc });
      GPUB.atlasUploadModule = device.createShaderModule({ label: 'atlas_upload.comp', code: atlasUploadSrc });
      GPUB.raycastModule = device.createShaderModule({ label: 'raycast.comp', code: raycastSrc });
      GPUB.spriteModule = device.createShaderModule({ label: 'sprite.comp', code: spriteSrc });
      GPUB.lightModule = device.createShaderModule({ label: 'light.comp', code: lightSrc });
      GPUB.rtShadowModule = device.createShaderModule({ label: 'rt_shadow.comp', code: rtShadowSrc });
      GPUB.bloomModule = device.createShaderModule({ label: 'bloom.comp', code: bloomSrc });

      // Layout y Bind Groups congelados (Grupos 0, 1, 2, 3, 4)
      GPUB.bglUniforms = device.createBindGroupLayout({
        label: 'BGL_Uniforms_Group0',
        entries: [{
          binding: 0,
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        }],
      });

      GPUB.bglWorld = device.createBindGroupLayout({
        label: 'BGL_World_Group1',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // blocks
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // cell_head
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // cz
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // chunk_state
        ],
      });

      GPUB.bglAtlas = device.createBindGroupLayout({
        label: 'BGL_Atlas_Group2',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } }, // atlas_tex
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // sprites
        ],
      });

      GPUB.bglGroup3Compute = device.createBindGroupLayout({
        label: 'BGL_Group3Compute',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // lights
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // shadows
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // gbuf
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // light_buf
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // bloom_buf
        ],
      });

      GPUB.bglGroup3Render = device.createBindGroupLayout({
        label: 'BGL_Group3Render',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // lights
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // shadows
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // gbuf
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // light_buf
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // bloom_buf
        ],
      });

      // Pipeline layouts (exactamente 4 bind groups: 0, 1, 2, 3)
      const computePipelineLayout = device.createPipelineLayout({
        label: 'ComputePipelineLayout',
        bindGroupLayouts: [GPUB.bglUniforms, GPUB.bglWorld, GPUB.bglAtlas, GPUB.bglGroup3Compute],
      });

      const renderPipelineLayout = device.createPipelineLayout({
        label: 'RenderPipelineLayout',
        bindGroupLayouts: [GPUB.bglUniforms, GPUB.bglWorld, GPUB.bglAtlas, GPUB.bglGroup3Render],
      });

      // Crear Compute Pipelines
      GPUB.raycastPipeline = device.createComputePipeline({
        label: 'RaycastComputePipeline',
        layout: computePipelineLayout,
        compute: { module: GPUB.raycastModule, entryPoint: 'main' },
      });

      GPUB.spritePipeline = device.createComputePipeline({
        label: 'SpriteComputePipeline',
        layout: computePipelineLayout,
        compute: { module: GPUB.spriteModule, entryPoint: 'main' },
      });

      GPUB.lightPipeline = device.createComputePipeline({
        label: 'LightComputePipeline',
        layout: computePipelineLayout,
        compute: { module: GPUB.lightModule, entryPoint: 'main' },
      });

      GPUB.rtShadowPipeline = device.createComputePipeline({
        label: 'RtShadowComputePipeline',
        layout: computePipelineLayout,
        compute: { module: GPUB.rtShadowModule, entryPoint: 'main' },
      });

      GPUB.bloomPipeline = device.createComputePipeline({
        label: 'BloomComputePipeline',
        layout: computePipelineLayout,
        compute: { module: GPUB.bloomModule, entryPoint: 'main' },
      });

      // Crear Render Pipeline (Compose)
      GPUB.composePipeline = device.createRenderPipeline({
        label: 'ComposeRenderPipeline',
        layout: renderPipelineLayout,
        vertex: { module: GPUB.composeVertModule, entryPoint: 'vs' },
        fragment: { module: GPUB.composeFragModule, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });

      // Crear Buffers de Almacenamiento
      // Mundo (Grupo 1)
      const POOL = 900000;
      const NCELL = 532 * 532;
      const NCHUNKS = 17 * 17 * 8;
      GPUB.blocksBuffer = device.createBuffer({
        label: 'BlocksBuffer',
        size: POOL * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      GPUB.cellHeadBuffer = device.createBuffer({
        label: 'CellHeadBuffer',
        size: NCELL * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      GPUB.czBuffer = device.createBuffer({
        label: 'CzBuffer',
        size: NCELL * 8,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      GPUB.chunkStateBuffer = device.createBuffer({
        label: 'ChunkStateBuffer',
        size: Math.max(NCHUNKS * 4, 16),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      // Sprites (Grupo 2, binding 1)
      GPUB.spritesBuffer = device.createBuffer({
        label: 'SpritesBuffer',
        size: 512 * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      // Luces y Sombras (Grupo 3)
      GPUB.lightsBuffer = device.createBuffer({
        label: 'LightsBuffer',
        size: 16 * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      GPUB.shadowsBuffer = device.createBuffer({
        label: 'ShadowsBuffer',
        size: 64 * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      // Textura Atlas 2048 x 4096 (rgba8uint)
      const texW = 2048, texH = 4096;
      GPUB.atlasTexture = device.createTexture({
        label: 'AtlasTexture_2048x4096',
        size: [texW, texH, 1],
        format: 'rgba8uint',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      GPUB.atlasStorageView = GPUB.atlasTexture.createView({ label: 'AtlasStorageView' });
      GPUB.atlasSampledView = GPUB.atlasTexture.createView({ label: 'AtlasSampledView' });

      // Staging buffer para carga completa del atlas (32 MB)
      const atlasBytes = texW * texH * 4;
      GPUB.atlasStagingBuffer = device.createBuffer({
        label: 'AtlasStagingBuffer',
        size: atlasBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      GPUB.atlasStagingHost = new Uint32Array(texW * texH);

      // Pipeline para subida de atlas
      GPUB.atlasUploadPipeline = device.createComputePipeline({
        label: 'AtlasUploadPipeline',
        layout: 'auto',
        compute: { module: GPUB.atlasUploadModule, entryPoint: 'main' },
      });

      GPUB.atlasUploadBindGroups = [
        device.createBindGroup({
          label: 'AtlasUpload_Group0',
          layout: GPUB.atlasUploadPipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: GPUB.atlasStagingBuffer } }],
        }),
        device.createBindGroup({
          label: 'AtlasUpload_Group1',
          layout: GPUB.atlasUploadPipeline.getBindGroupLayout(1),
          entries: [{ binding: 0, resource: GPUB.atlasStorageView }],
        }),
      ];

      // Triple buffering (Grupo 0 y Grupo 4)
      const MAXP = 800 * 500;
      for (let i = 0; i < 3; i++) {
        GPUB.uniformBuffers[i] = device.createBuffer({
          label: `UniformBuffer_${i}`,
          size: 256,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        GPUB.uniformBindGroups[i] = device.createBindGroup({
          label: `UniformBindGroup_${i}`,
          layout: GPUB.bglUniforms,
          entries: [{ binding: 0, resource: { buffer: GPUB.uniformBuffers[i] } }],
        });

        // G-buffer (4 u32 por píxel: 16 bytes)
        GPUB.gbufBuffers[i] = device.createBuffer({
          label: `GbufBuffer_${i}`,
          size: MAXP * 16,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Light buffer (1 vec4<f32> por píxel: 16 bytes)
        GPUB.lightBufBuffers[i] = device.createBuffer({
          label: `LightBufBuffer_${i}`,
          size: MAXP * 16,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Bloom buffer (downsample 4x4)
        GPUB.bloomBufBuffers[i] = device.createBuffer({
          label: `BloomBufBuffer_${i}`,
          size: Math.max((MAXP / 16) * 4, 16),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        GPUB.group3ComputeBindGroups[i] = device.createBindGroup({
          label: `Group3Compute_${i}`,
          layout: GPUB.bglGroup3Compute,
          entries: [
            { binding: 0, resource: { buffer: GPUB.lightsBuffer } },
            { binding: 1, resource: { buffer: GPUB.shadowsBuffer } },
            { binding: 2, resource: { buffer: GPUB.gbufBuffers[i] } },
            { binding: 3, resource: { buffer: GPUB.lightBufBuffers[i] } },
            { binding: 4, resource: { buffer: GPUB.bloomBufBuffers[i] } },
          ],
        });

        GPUB.group3RenderBindGroups[i] = device.createBindGroup({
          label: `Group3Render_${i}`,
          layout: GPUB.bglGroup3Render,
          entries: [
            { binding: 0, resource: { buffer: GPUB.lightsBuffer } },
            { binding: 1, resource: { buffer: GPUB.shadowsBuffer } },
            { binding: 2, resource: { buffer: GPUB.gbufBuffers[i] } },
            { binding: 3, resource: { buffer: GPUB.lightBufBuffers[i] } },
            { binding: 4, resource: { buffer: GPUB.bloomBufBuffers[i] } },
          ],
        });
      }

      // Bind Groups estáticos para Grupos 1, 2
      GPUB.worldBindGroup = device.createBindGroup({
        label: 'World_Group1',
        layout: GPUB.bglWorld,
        entries: [
          { binding: 0, resource: { buffer: GPUB.blocksBuffer } },
          { binding: 1, resource: { buffer: GPUB.cellHeadBuffer } },
          { binding: 2, resource: { buffer: GPUB.czBuffer } },
          { binding: 3, resource: { buffer: GPUB.chunkStateBuffer } },
        ],
      });

      GPUB.atlasBindGroup = device.createBindGroup({
        label: 'Atlas_Group2',
        layout: GPUB.bglAtlas,
        entries: [
          { binding: 0, resource: GPUB.atlasSampledView },
          { binding: 1, resource: { buffer: GPUB.spritesBuffer } },
        ],
      });

      // Subir todos los recursos estáticos (texturas, cielo, atlas)
      uploadAllTexturesToAtlas();

      // Timestamps opcionales (6 puntos: inicio, post-raycast, post-light, post-rt, post-bloom, post-present)
      if (GPUB.hasTimestamps) {
        GPUB.querySet = device.createQuerySet({ type: 'timestamp', count: 6 });
        GPUB.resolveBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        GPUB.readBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      }

      GPUB.ready = true;
      CAPS.webgpu = true;
      CAPS.gpuAdapter = adapter;
      if (wasm && wasm.gpu_set_status) wasm.gpu_set_status(1, 1);

      // Activar canvas GPU y transparentar canvas 2D
      GPUB.canvas.style.display = 'block';
      if (view) view.style.background = 'transparent';
      if (img && img.data) img.data.fill(0);
      if (lctx) lctx.clearRect(0, 0, RW, RH);

      WHY.webgpu = '';
      return true;
    } catch (err) {
      console.warn('Error al iniciar WebGPU:', err);
      WHY.webgpu = String(err && err.message || err);
      GPUB.ready = false;
      stopGPU();
      return false;
    }
  }

  function uploadAllTexturesToAtlas() {
    if (!GPUB.device || !GPUB.atlasStagingHost) return;
    const staging = GPUB.atlasStagingHost;
    const texW = 2048;

    // 1. Cielo (1536 x 768) en y: 0..767
    if (typeof sky !== 'undefined' && sky && sky.length) {
      for (let y = 0; y < SKH; y++) {
        staging.set(sky.subarray(y * SKW, (y + 1) * SKW), y * texW);
      }
    }

    // 2. Sprites dinámicos en y: 1024..2047
    const atlData = (typeof ATL !== 'undefined' && ATL.data) ? ATL.data : (wasm && wasm.p_atlas ? new Uint32Array(wasm.memory.buffer, wasm.p_atlas(), 1 << 21) : null);
    if (atlData) {
      const atlLen = Math.min(atlData.length, 2048 * 1024);
      staging.set(atlData.subarray(0, atlLen), 1024 * texW);
    }

    // 3. Texturas de paredes (TEXLV) en y: 2048..3071
    // 128 losas de 128x128 dispuestas en rejilla de 16x8 losas
    if (wasm && wasm.p_texlv) {
      const tlv = new Uint32Array(wasm.memory.buffer, wasm.p_texlv(), 8 * 16 * 16384);
      for (let k = 1; k <= 7; k++) {
        for (let lvl = 0; lvl < 16; lvl++) {
          const tileIdx = k * 16 + lvl;
          const tileCol = tileIdx % 16;
          const tileRow = Math.floor(tileIdx / 16);
          const tileX0 = tileCol * 128;
          const tileY0 = 2048 + tileRow * 128;
          for (let ty = 0; ty < 128; ty++) {
            const srcOff = tileIdx * 16384 + ty * 128;
            const dstOff = (tileY0 + ty) * texW + tileX0;
            staging.set(tlv.subarray(srcOff, srcOff + 128), dstOff);
          }
        }
      }
    } else if (typeof TEX !== 'undefined') {
      for (let k = 1; k <= 7; k++) {
        if (!TEX[k] || !TEX[k].lv) continue;
        for (let lvl = 0; lvl < 16; lvl++) {
          const tileIdx = k * 16 + lvl;
          const tileCol = tileIdx % 16;
          const tileRow = Math.floor(tileIdx / 16);
          const tileX0 = tileCol * 128;
          const tileY0 = 2048 + tileRow * 128;
          const lvData = TEX[k].lv[lvl];
          for (let ty = 0; ty < 128; ty++) {
            const srcOff = ty * 128;
            const dstOff = (tileY0 + ty) * texW + tileX0;
            staging.set(lvData.subarray(srcOff, srcOff + 128), dstOff);
          }
        }
      }
    }

    // 4. Texturas emisivas (TEXGL) en y: 3072..3199
    if (wasm && wasm.p_texgl) {
      const tgl = new Uint32Array(wasm.memory.buffer, wasm.p_texgl(), 8 * 16384);
      for (let k = 1; k <= 7; k++) {
        for (let ty = 0; ty < 128; ty++) {
          const srcOff = k * 16384 + ty * 128;
          const dstOff = (3072 + ty) * texW + k * 128;
          staging.set(tgl.subarray(srcOff, srcOff + 128), dstOff);
        }
      }
    }

    // 5. Rim colors (RIM) en fila y: 3200 y RIMG en y: 3201
    if (wasm && wasm.p_rim && wasm.p_rimg) {
      const rim = new Uint32Array(wasm.memory.buffer, wasm.p_rim(), 8 * 16);
      const rimg = new Uint32Array(wasm.memory.buffer, wasm.p_rimg(), 8 * 16);
      staging.set(rim.subarray(0, 128), 3200 * texW);
      staging.set(rimg.subarray(0, 128), 3201 * texW);
    }

    GPUB.queue.writeBuffer(GPUB.atlasStagingBuffer, 0, staging.buffer);

    const encoder = GPUB.device.createCommandEncoder({ label: 'AtlasUploadEncoder' });
    const pass = encoder.beginComputePass({ label: 'AtlasUploadPass' });
    pass.setPipeline(GPUB.atlasUploadPipeline);
    pass.setBindGroup(0, GPUB.atlasUploadBindGroups[0]);
    pass.setBindGroup(1, GPUB.atlasUploadBindGroups[1]);
    pass.dispatchWorkgroups(2048 / 8, 4096 / 8, 1);
    pass.end();
    GPUB.queue.submit([encoder.finish()]);
    GPUB.atlasUploaded = true;
  }

  function syncWorldToGPU() {
    if (!wasm || !GPUB.device) return;
    if (!GPUB.worldUploaded) {
      if (wasm.gpu_upload_world) wasm.gpu_upload_world();
      const used = (wasm.w_used ? wasm.w_used() : 0) || 50000;
      const stagePtr = wasm.p_gpu_stage ? wasm.p_gpu_stage() : 0;
      const headPtr = wasm.p_head ? wasm.p_head() : 0;
      const czPtr = wasm.p_cz ? wasm.p_cz() : 0;

      if (stagePtr) {
        const blockBytes = Math.min(used * 32, 900000 * 32);
        GPUB.queue.writeBuffer(GPUB.blocksBuffer, 0, new Uint8Array(wasm.memory.buffer, stagePtr, blockBytes));
      }
      if (headPtr) {
        GPUB.queue.writeBuffer(GPUB.cellHeadBuffer, 0, new Uint8Array(wasm.memory.buffer, headPtr, 532 * 532 * 4));
      }
      if (czPtr) {
        GPUB.queue.writeBuffer(GPUB.czBuffer, 0, new Uint8Array(wasm.memory.buffer, czPtr, 532 * 532 * 8));
      }
      GPUB.worldUploaded = true;
      return;
    }

    if (wasm.w_dirty) {
      const dirtyPtr = wasm.w_dirty();
      const d = new Uint32Array(wasm.memory.buffer, dirtyPtr, 4);
      const cellMin = d[0], cellMax = d[1], blockMin = d[2], blockMax = d[3];
      if (cellMax > cellMin || blockMax > blockMin) {
        if (wasm.gpu_upload_dirty) {
          const drPtr = dirtyPtr;
          const drHost = new Uint32Array([cellMin, cellMax, blockMin, blockMax, 0, 0, 0, 0]);
          new Uint32Array(wasm.memory.buffer, drPtr, 8).set(drHost);
          wasm.gpu_upload_dirty(drPtr);
        }
        if (cellMax > cellMin) {
          const headPtr = wasm.p_head();
          const czPtr = wasm.p_cz();
          const stagePtr = wasm.p_gpu_stage();
          const cOffset = cellMin * 4;
          const cBytes = (cellMax - cellMin) * 4;
          GPUB.queue.writeBuffer(GPUB.cellHeadBuffer, cOffset, new Uint8Array(wasm.memory.buffer, headPtr + cOffset, cBytes));
          GPUB.queue.writeBuffer(GPUB.czBuffer, cellMin * 8, new Uint8Array(wasm.memory.buffer, czPtr + cellMin * 8, (cellMax - cellMin) * 8));

          for (let ci = cellMin; ci < cellMax; ci++) {
            let bi = new Uint32Array(wasm.memory.buffer, headPtr + ci * 4, 1)[0];
            while (bi !== 0) {
              const idx = bi - 1;
              GPUB.queue.writeBuffer(GPUB.blocksBuffer, idx * 32, new Uint8Array(wasm.memory.buffer, stagePtr + idx * 32, 32));
              bi = new Uint32Array(wasm.memory.buffer, stagePtr + idx * 32, 1)[0];
            }
          }
        }
      }
    }
  }

  function syncDynamicEntities() {
    if (!GPUB.device) return;

    // 1. Luces
    if (typeof FR !== 'undefined' && FR.nl > 0 && FR.LV) {
      const nl = Math.min(FR.nl, 16);
      GPUB.queue.writeBuffer(GPUB.lightsBuffer, 0, FR.LV.buffer, FR.LV.byteOffset, nl * 32);
    }

    // 2. Sombras
    if (typeof FR !== 'undefined' && FR.ns > 0 && FR.shadows) {
      const ns = Math.min(FR.ns, 64);
      const S = GPUB.shadowsHostF32;
      for (let k = 0; k < ns; k++) {
        const sh = FR.shadows[k];
        const o = k * 8;
        S[o] = sh[0];
        S[o + 1] = sh[1];
        S[o + 2] = sh[2];
        S[o + 3] = sh[3];
        S[o + 4] = sh[4];
        S[o + 5] = 0;
        S[o + 6] = 0;
        S[o + 7] = 0;
      }
      GPUB.queue.writeBuffer(GPUB.shadowsBuffer, 0, S.buffer, 0, ns * 32);
    }

    // 3. Sprites
    if (typeof sprN !== 'undefined' && sprN > 0 && typeof SPRQ !== 'undefined') {
      const count = Math.min(sprN, 512);
      const U32 = GPUB.spritesU32;
      const F32 = GPUB.spritesF32;
      for (let k = 0; k < count; k++) {
        const o = k * 8;
        U32[o] = SPRQ[o] >>> 0;
        U32[o + 1] = SPRQ[o + 1] >>> 0;
        F32[o + 2] = SPRQ[o + 2];
        F32[o + 3] = SPRQ[o + 3];
        F32[o + 4] = SPRQ[o + 4];
        F32[o + 5] = SPRQ[o + 5];
        F32[o + 6] = SPRQ[o + 6];
        F32[o + 7] = SPRQ[o + 7];
      }
      GPUB.queue.writeBuffer(GPUB.spritesBuffer, 0, GPUB.spritesHost, 0, count * 32);
    }
  }

  function stopGPU() {
    GPUB.ready = false;
    if (GPUB.device) { try { GPUB.device.destroy(); } catch (_) {} GPUB.device = null; }
    if (GPUB.canvas) GPUB.canvas.style.display = 'none';
    if (view) view.style.background = '';
    if (wasm && wasm.gpu_set_status) wasm.gpu_set_status(0, 0);
  }

  async function gpuFrameDone(t0) {
    if (!GPUB.ready || !GPUB.device) return performance.now();
    try {
      await GPUB.queue.onSubmittedWorkDone();
    } catch (_) {}
    return performance.now();
  }

  function updateUniformData(slot) {
    const F = GPUB.uniformF32;
    const U = GPUB.uniformU32;

    // Offset 0: cam_pos (vec3<f32>, pad)
    F[0] = (typeof px !== 'undefined' ? px : 0);
    F[1] = (typeof py !== 'undefined' ? py : 0);
    F[2] = (typeof camZ !== 'undefined' ? camZ : 0);
    F[3] = 0.0;

    // Offset 16: cam_dir (vec3<f32>, pad)
    F[4] = (typeof CAM !== 'undefined' ? CAM.fx : 1.0);
    F[5] = (typeof CAM !== 'undefined' ? CAM.fy : 0.0);
    F[6] = (typeof CAM !== 'undefined' ? CAM.fz : 0.0);
    F[7] = 0.0;

    // Offset 32: cam_right (vec3<f32>, pad)
    F[8] = (typeof CAM !== 'undefined' ? CAM.rx : 0.0);
    F[9] = (typeof CAM !== 'undefined' ? CAM.ry : 1.0);
    F[10] = 0.0;
    F[11] = 0.0;

    // Offset 48: cam_up (vec3<f32>, pad)
    F[12] = (typeof CAM !== 'undefined' ? CAM.ux : 0.0);
    F[13] = (typeof CAM !== 'undefined' ? CAM.uy : 0.0);
    F[14] = (typeof CAM !== 'undefined' ? CAM.uz : 1.0);
    F[15] = 0.0;

    // Offset 64: res (vec2<u32>), rt_mode (u32), rt_max (f32)
    U[16] = (typeof RW !== 'undefined' && RW ? RW : 960);
    U[17] = (typeof RH !== 'undefined' && RH ? RH : 600);
    U[18] = (typeof EFF !== 'undefined' && EFF.rt !== undefined ? EFF.rt : 0);
    F[19] = (typeof CFG !== 'undefined' && CFG.rt ? CFG.rt.maxDist : 16.0);

    // Offset 80: n_lights (u32), n_shadows (u32), lamp (u32), acid (u32)
    U[20] = (typeof FR !== 'undefined' && FR.nl ? FR.nl : 0);
    U[21] = (typeof FR !== 'undefined' && FR.ns ? FR.ns : 0);
    U[22] = (typeof st !== 'undefined' && st.lamp ? 1 : 0);
    U[23] = (typeof acidOff !== 'undefined' ? acidOff : 0);

    // Offset 96: maxd (f32), pl (f32), n_sprites (u32), pad (f32)
    F[24] = (typeof MAXD !== 'undefined' ? MAXD : 40.0);
    F[25] = (typeof PL !== 'undefined' ? PL : 0.57735);
    U[26] = (typeof sprN !== 'undefined' ? sprN : 0);
    F[27] = 0.0;

    // Offset 112: bloom_enabled (u32), vignette_strength (f32), gamma (f32), _pad5 (f32)
    const bloomOn = (typeof CFG !== 'undefined' && CFG.graphics && CFG.graphics.bloom) ? 1 : 0;
    U[28] = (typeof window !== 'undefined' && window.FORCE_GPU_BLOOM !== undefined) ? (window.FORCE_GPU_BLOOM ? 1 : 0) : bloomOn;
    F[29] = (typeof CFG !== 'undefined' && CFG.graphics && CFG.graphics.vignette !== undefined) ? CFG.graphics.vignette : 0.0;
    F[30] = (typeof CFG !== 'undefined' && CFG.graphics && CFG.graphics.gamma !== undefined) ? CFG.graphics.gamma : 1.0;
    F[31] = 0.0;

    GPUB.queue.writeBuffer(GPUB.uniformBuffers[slot], 0, F.buffer, 0, 128);
  }

  function gpuRender(tPrep) {
    if (!GPUB.ready || !GPUB.device || (wasm && wasm.gpu_is_lost && wasm.gpu_is_lost())) {
      if (typeof setBackend === 'function' && typeof BACKEND !== 'undefined' && BACKEND === 'webgpu') {
        setBackend('rust');
      }
      return;
    }
    const tA = performance.now();

    // Sincronizar dimensiones de canvas con RW / RH si difieren
    if (GPUB.canvas && (GPUB.canvas.width !== RW || GPUB.canvas.height !== RH)) {
      GPUB.canvas.width = RW;
      GPUB.canvas.height = RH;
      GPUB.ctx.configure({
        device: GPUB.device,
        format: GPUB.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        alphaMode: 'opaque',
      });
    }

    // 1. Slot de triple buffering
    const slot = (wasm && wasm.gpu_begin_frame) ? (wasm.gpu_begin_frame() % 3) : 0;

    // 2. Actualizar uniforms del fotograma en el buffer de slot
    updateUniformData(slot);

    // 3. Sincronizar mundo a storage buffers
    syncWorldToGPU();

    // 4. Sincronizar entidades dinámicas (luces, sombras, sprites)
    syncDynamicEntities();

    const commandEncoder = GPUB.device.createCommandEncoder({ label: 'FrameCommandEncoder' });
    const currentTexture = GPUB.ctx.getCurrentTexture();

    const useTimestamps = !!(GPUB.hasTimestamps && GPUB.querySet);
    if (useTimestamps) {
      commandEncoder.writeTimestamp(GPUB.querySet, 0);
    }

    // 5. Pase 1: Raycast compute pass
    {
      const pass = commandEncoder.beginComputePass({ label: 'RaycastComputePass' });
      pass.setPipeline(GPUB.raycastPipeline);
      pass.setBindGroup(0, GPUB.uniformBindGroups[slot]);
      pass.setBindGroup(1, GPUB.worldBindGroup);
      pass.setBindGroup(2, GPUB.atlasBindGroup);
      pass.setBindGroup(3, GPUB.group3ComputeBindGroups[slot]);
      pass.dispatchWorkgroups(Math.ceil(RW / 8), Math.ceil(RH / 8), 1);
      pass.end();
    }

    // 6. Pase 2: Sprite compute pass (si hay sprites)
    if (typeof sprN !== 'undefined' && sprN > 0) {
      const pass = commandEncoder.beginComputePass({ label: 'SpriteComputePass' });
      pass.setPipeline(GPUB.spritePipeline);
      pass.setBindGroup(0, GPUB.uniformBindGroups[slot]);
      pass.setBindGroup(1, GPUB.worldBindGroup);
      pass.setBindGroup(2, GPUB.atlasBindGroup);
      pass.setBindGroup(3, GPUB.group3ComputeBindGroups[slot]);
      pass.dispatchWorkgroups(Math.ceil(RW / 8), Math.ceil(RH / 8), 1);
      pass.end();
    }

    if (useTimestamps) {
      commandEncoder.writeTimestamp(GPUB.querySet, 1);
    }

    // 7. Pase 3: Light compute pass
    {
      const pass = commandEncoder.beginComputePass({ label: 'LightComputePass' });
      pass.setPipeline(GPUB.lightPipeline);
      pass.setBindGroup(0, GPUB.uniformBindGroups[slot]);
      pass.setBindGroup(1, GPUB.worldBindGroup);
      pass.setBindGroup(2, GPUB.atlasBindGroup);
      pass.setBindGroup(3, GPUB.group3ComputeBindGroups[slot]);
      pass.dispatchWorkgroups(Math.ceil(RW / 16), Math.ceil(RH / 16), 1);
      pass.end();
    }

    if (useTimestamps) {
      commandEncoder.writeTimestamp(GPUB.querySet, 2);
    }

    // 8. Pase 4: RT Shadow compute pass (si rt_mode > 0 y hay luces)
    const rtMode = (typeof EFF !== 'undefined' && EFF.rt !== undefined) ? EFF.rt : 0;
    const nLights = (typeof FR !== 'undefined' && FR.nl) ? FR.nl : 0;
    if (rtMode > 0 && nLights > 0) {
      const pass = commandEncoder.beginComputePass({ label: 'RtShadowComputePass' });
      pass.setPipeline(GPUB.rtShadowPipeline);
      pass.setBindGroup(0, GPUB.uniformBindGroups[slot]);
      pass.setBindGroup(1, GPUB.worldBindGroup);
      pass.setBindGroup(2, GPUB.atlasBindGroup);
      pass.setBindGroup(3, GPUB.group3ComputeBindGroups[slot]);
      pass.dispatchWorkgroups(Math.ceil(RW / 16), Math.ceil(RH / 16), 1);
      pass.end();
    }

    if (useTimestamps) {
      commandEncoder.writeTimestamp(GPUB.querySet, 3);
    }

    // 9. Pase 5: Bloom compute pass (si bloom activo)
    const bloomEnabled = (typeof window !== 'undefined' && window.FORCE_GPU_BLOOM !== undefined) ? (window.FORCE_GPU_BLOOM ? 1 : 0) : ((typeof CFG !== 'undefined' && CFG.graphics && CFG.graphics.bloom) ? 1 : 0);
    if (bloomEnabled) {
      const pass = commandEncoder.beginComputePass({ label: 'BloomComputePass' });
      pass.setPipeline(GPUB.bloomPipeline);
      pass.setBindGroup(0, GPUB.uniformBindGroups[slot]);
      pass.setBindGroup(1, GPUB.worldBindGroup);
      pass.setBindGroup(2, GPUB.atlasBindGroup);
      pass.setBindGroup(3, GPUB.group3ComputeBindGroups[slot]);
      pass.dispatchWorkgroups(Math.ceil(RW / 32), Math.ceil(RH / 32), 1);
      pass.end();
    }

    if (useTimestamps) {
      commandEncoder.writeTimestamp(GPUB.querySet, 4);
    }

    // 10. Pase 6: Compose render pass
    {
      const renderPass = commandEncoder.beginRenderPass({
        label: 'ComposeRenderPass',
        colorAttachments: [{
          view: currentTexture.createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });

      renderPass.setPipeline(GPUB.composePipeline);
      renderPass.setBindGroup(0, GPUB.uniformBindGroups[slot]);
      renderPass.setBindGroup(1, GPUB.worldBindGroup);
      renderPass.setBindGroup(2, GPUB.atlasBindGroup);
      renderPass.setBindGroup(3, GPUB.group3RenderBindGroups[slot]);
      renderPass.draw(3, 1, 0, 0);
      renderPass.end();
    }

    if (useTimestamps) {
      commandEncoder.writeTimestamp(GPUB.querySet, 5);
      commandEncoder.resolveQuerySet(GPUB.querySet, 0, 6, GPUB.resolveBuffer, 0);
      if (!GPUB._queryReading) {
        commandEncoder.copyBufferToBuffer(GPUB.resolveBuffer, 0, GPUB.readBuffer, 0, 6 * 8);
      }
    }

    if (GPUB._pendingReadback) {
      const { readBuffer, bytesPerRow, w, h } = GPUB._pendingReadback;
      commandEncoder.copyTextureToBuffer(
        { texture: currentTexture },
        { buffer: readBuffer, bytesPerRow },
        [w, h, 1]
      );
    }

    GPUB.queue.submit([commandEncoder.finish()]);

    if (useTimestamps && !GPUB._queryReading) {
      GPUB._queryReading = true;
      GPUB.readBuffer.mapAsync(GPUMapMode.READ).then(() => {
        try {
          const times = new BigUint64Array(GPUB.readBuffer.getMappedRange());
          const tRay = Number(times[1] - times[0]) / 1e6;
          const tLight = Number(times[2] - times[1]) / 1e6;
          const tRt = Number(times[3] - times[2]) / 1e6;
          const tBloom = Number(times[4] - times[3]) / 1e6;
          const tComp = Number(times[5] - times[4]) / 1e6;
          const tTotal = Number(times[5] - times[0]) / 1e6;
          GPUB.perf = {
            raycast: Math.max(tRay, 0),
            light: Math.max(tLight, 0),
            rt: Math.max(tRt, 0),
            bloom: Math.max(tBloom, 0),
            compose: Math.max(tComp, 0),
            total: Math.max(tTotal, 0),
          };
          if (typeof perfAdd === 'function') {
            perfAdd('gpu_raycast', GPUB.perf.raycast);
            perfAdd('gpu_light', GPUB.perf.light);
            perfAdd('gpu_rt', GPUB.perf.rt);
            perfAdd('gpu_bloom', GPUB.perf.bloom);
            perfAdd('gpu_compose', GPUB.perf.compose);
          }
        } finally {
          GPUB.readBuffer.unmap();
          GPUB._queryReading = false;
        }
      }).catch(() => {
        GPUB._queryReading = false;
      });
    } else if (!useTimestamps) {
      GPUB.perf = {
        raycast: 0,
        light: 0,
        rt: 0,
        bloom: 0,
        compose: 0,
        total: perf.gpu || 0,
      };
    }

    if (wasm && wasm.gpu_end_frame) wasm.gpu_end_frame();

    // Mantener canvas 2D transparente para HUD
    if (ctx) ctx.clearRect(0, 0, W, H);
    if (img && img.data && img.data[3] !== 0) img.data.fill(0);

    const tB = performance.now();
    perf.gpu = tB - tA;
    if (typeof PERF !== 'undefined' && PERF.c) {
      PERF.c.draws = 1;
      PERF.c.uploadBytes = (wasm && wasm.gpu_bytes_uploaded) ? wasm.gpu_bytes_uploaded() : 112;
      PERF.c.instances = (typeof FR !== 'undefined' ? FR.nl : 0);
    }
    if (typeof perfAdd === 'function') {
      perfAdd('world', tB - tA);
      perfAdd('light', 0);
      perfAdd('sprites', tPrep || 0);
    }
  }

  async function readGpuFrame(rw, rh) {
    if (!GPUB.device || !GPUB.ctx) return null;
    GPUB.device.pushErrorScope('validation');
    const w = rw || RW || 800;
    const h = rh || RH || 500;
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
    const bufferSize = bytesPerRow * h;
    const readBuffer = GPUB.device.createBuffer({
      label: 'ReadbackBuffer',
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    GPUB._pendingReadback = { readBuffer, bytesPerRow, w, h };
    gpuRender(0);
    GPUB._pendingReadback = null;

    const valErr = await GPUB.device.popErrorScope();
    if (valErr) console.warn('[WEBGPU ERROR SCOPE]:', valErr.message);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readBuffer.getMappedRange());
    const out = new Uint8ClampedArray(w * h * 4);
    const isBgra = (GPUB.format === 'bgra8unorm');
    for (let y = 0; y < h; y++) {
      const srcRow = y * bytesPerRow;
      const dstRow = y * w * 4;
      for (let x = 0; x < w; x++) {
        const si = srcRow + x * 4;
        const di = dstRow + x * 4;
        if (isBgra) {
          out[di] = mapped[si + 2];     // R
          out[di + 1] = mapped[si + 1]; // G
          out[di + 2] = mapped[si];     // B
          out[di + 3] = mapped[si + 3]; // A
        } else {
          out[di] = mapped[si];         // R
          out[di + 1] = mapped[si + 1]; // G
          out[di + 2] = mapped[si + 2]; // B
          out[di + 3] = mapped[si + 3]; // A
        }
      }
    }
    readBuffer.unmap();
    readBuffer.destroy();
    return out;
  }
  GPUB.readGpuFrame = readGpuFrame;
  GPUB.updateUniformData = updateUniformData;
  GPUB.syncWorldToGPU = syncWorldToGPU;
  GPUB.syncDynamicEntities = syncDynamicEntities;
