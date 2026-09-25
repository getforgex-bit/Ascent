#!/bin/sh
# Compila el motor Rust a WebAssembly en dos variantes:
#   forgex_gfx.wasm         SIMD de 128 bits + bulk-memory + conversiones sin trampa (navegadores de 2021 en adelante)
#   forgex_gfx_scalar.wasm  WebAssembly 1.0 (MVP) sin SIMD: mismo resultado, más lento, para navegadores antiguos
# Después, ../forgex/build.py incrusta ambas en el HTML del juego y el juego elige en tiempo de ejecución.
# Requiere: rustc (se usa RUSTC_BOOTSTRAP=1 para el core propio) y un core/compiler_builtins compilados para cada
# variante en $WSYS (SIMD) y $WSYS_MVP (MVP); ver README.md.
set -e
cd "$(dirname "$0")"
WSYS=${WSYS:-/tmp/claude-0/wsys}
WSYS_MVP=${WSYS_MVP:-/tmp/claude-0/wsys-mvp}
build() { # $1 = sysroot, $2 = salida, resto = flags
  sys=$1; out=$2; shift 2
  RUSTC_BOOTSTRAP=1 rustc --edition 2021 --crate-type cdylib --target wasm32-unknown-unknown \
    -C opt-level=3 -C panic=abort "$@" \
    -L "$sys" --extern core="$sys/libcore.rlib" --extern compiler_builtins="$sys/libcompiler_builtins.rlib" \
    --sysroot /nonexistent src/lib.rs -o "$out"
}
if [ -d "$WSYS" ] && [ -d "$WSYS_MVP" ]; then
  build "$WSYS" forgex_gfx.wasm -C target-feature=+simd128,+bulk-memory,+nontrapping-fptoint
  build "$WSYS_MVP" forgex_gfx_scalar.wasm -C target-cpu=mvp
else
  RUSTC_BOOTSTRAP=1 RUSTFLAGS="-C target-feature=+simd128,+bulk-memory,+nontrapping-fptoint" cargo build --release --target wasm32-unknown-unknown
  cp target/wasm32-unknown-unknown/release/forgex_gfx.wasm forgex_gfx.wasm
  RUSTC_BOOTSTRAP=1 RUSTFLAGS="-C target-cpu=mvp" cargo build --release --target wasm32-unknown-unknown
  cp target/wasm32-unknown-unknown/release/forgex_gfx.wasm forgex_gfx_scalar.wasm
fi
ls -l forgex_gfx.wasm forgex_gfx_scalar.wasm
