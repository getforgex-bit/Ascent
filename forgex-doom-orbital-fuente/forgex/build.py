#!/usr/bin/env python3
"""Ensambla FORGEX DOOM Orbital en un único HTML autocontenido.

- src/page.html: cabecera, estilos y marcado; /*@@SCRIPT@@*/ marca dónde va el código.
- src/js/NNN-*.js: partes del juego en orden (comparten el mismo ámbito, dentro de una sola función).
- src/shaders/*.wgsl: shaders de WebGPU, se incrustan como cadenas (@@WGSL:nombre@@).
- src/workers/*.js: código de los workers, se incrusta como cadena (@@WORKER:nombre@@).
- ../rust-gfx/forgex_gfx*.wasm: motor Rust, se incrusta en base64 (@@WASM_SIMD@@, @@WASM_SCALAR@@).
"""
import base64, glob, json, os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(ROOT), 'dist', 'forgex-doom-orbital.html')
def read(p): return open(p, encoding='utf-8').read()
page = read(os.path.join(ROOT, 'src', 'page.html'))
parts = sorted(glob.glob(os.path.join(ROOT, 'src', 'js', '*.js')))
script = ''.join(read(p) for p in parts)
def b64(name):
    p = os.path.join(os.path.dirname(ROOT), 'rust-gfx', name)
    return base64.b64encode(open(p, 'rb').read()).decode() if os.path.exists(p) else ''
script = script.replace('@@WASM_SIMD@@', b64('forgex_gfx.wasm')).replace('@@WASM_SCALAR@@', b64('forgex_gfx_scalar.wasm'))
def inline(kind, folder, ext):
    global script
    for m in set(re.findall(r"'@@%s:([a-z0-9_.]+)@@'" % kind, script)):
        p = os.path.join(ROOT, 'src', folder, m + ext)
        script = script.replace("'@@%s:%s@@'" % (kind, m), json.dumps(read(p)))
inline('WGSL', 'shaders', '.wgsl'); inline('WORKER', 'workers', '.js')
left = re.findall(r'@@[A-Z_]+(?::[a-z0-9_.]+)?@@', script)
if left: sys.exit('marcadores sin resolver: %s' % left)
html = page.replace('/*@@SCRIPT@@*/\n', script)
open(OUT, 'w', encoding='utf-8').write(html)
print('escrito %s (%d KB, %d partes)' % (OUT, len(html.encode()) // 1024, len(parts)))
