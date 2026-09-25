# Escanea las instrucciones de un .wasm y cuenta las que no son WebAssembly 1.0 (MVP).
import sys
def leb(b, i, signed=False):
    r = s = 0
    while True:
        x = b[i]; i += 1; r |= (x & 0x7f) << s; s += 7
        if x < 0x80: break
    if signed and (x & 0x40): r -= 1 << s
    return r, i
def scan(path):
    b = open(path, 'rb').read(); assert b[:4] == b'\0asm'
    i = 8; found = {}
    def note(k): found[k] = found.get(k, 0) + 1
    while i < len(b):
        sid = b[i]; i += 1; size, i = leb(b, i); end = i + size
        if sid == 10:
            n, j = leb(b, i)
            for _ in range(n):
                fsz, j = leb(b, j); fend = j + fsz
                nl, j = leb(b, j)
                for _ in range(nl): _, j = leb(b, j); j += 1
                while j < fend:
                    op = b[j]; j += 1
                    if op in (2, 3, 4):
                        bt = b[j]
                        if bt == 0x40 or bt in (0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f): j += 1
                        else: _, j = leb(b, j, True); note('multivalue (tipo de bloque)')
                    elif op in (0x0c, 0x0d, 0x10, 0x20, 0x21, 0x22, 0x23, 0x24): _, j = leb(b, j)
                    elif op == 0x0e:
                        c, j = leb(b, j)
                        for _ in range(c + 1): _, j = leb(b, j)
                    elif op == 0x11: _, j = leb(b, j); t, j = leb(b, j)
                    elif op in (0x25, 0x26): _, j = leb(b, j); note('reference-types (tabla)')
                    elif 0x28 <= op <= 0x3e: _, j = leb(b, j); _, j = leb(b, j)
                    elif op in (0x3f, 0x40): j += 1
                    elif op == 0x41: _, j = leb(b, j, True)
                    elif op == 0x42: _, j = leb(b, j, True)
                    elif op == 0x43: j += 4
                    elif op == 0x44: j += 8
                    elif 0xc0 <= op <= 0xc4: note('sign-ext')
                    elif op in (0xd0,): j += 1; note('reference-types')
                    elif op in (0xd1,): note('reference-types')
                    elif op == 0xd2: _, j = leb(b, j); note('reference-types')
                    elif op == 0x1c: c, j = leb(b, j); j += c; note('select tipado')
                    elif op == 0xfc:
                        sub, j = leb(b, j)
                        if sub <= 7: note('conversiones saturadas (nontrapping-fptoint)')
                        else:
                            note('bulk-memory / tablas (0xFC %d)' % sub)
                            if sub == 8: _, j = leb(b, j); j += 1
                            elif sub == 9: _, j = leb(b, j)
                            elif sub == 10: j += 2
                            elif sub == 11: j += 1
                            elif sub in (12, 14): _, j = leb(b, j); _, j = leb(b, j)
                            else: _, j = leb(b, j)
                    elif op == 0xfd: note('SIMD'); j = fend; break
                    elif op in (0, 1, 5, 0x0b, 0x0f, 0x1a, 0x1b) or 0x45 <= op <= 0xbf: pass
                    else: note('opcode desconocido 0x%02x' % op); j = fend
                j = fend
        i = end
    return found
for p in sys.argv[1:]:
    f = scan(p); print(p, '→', f if f else 'solo WebAssembly 1.0 (MVP)')
