  // ================= COLISIONES =================
  function blocked(x, y, z) { const c = cellAt(x, y); if (!c) return false; for (const b of c) if (b.zt > z + .35 && b.zb < z + .95) return true; return false; }
  function floorAt(x, y, z) { const c = cellAt(x, y); if (!c) return false; let f = false;
    for (const b of c) { if (Math.abs(b.zt - z) < .02) f = true; else if (b.zt > z + .35 && b.zb < z + .95) return false; } return f; }
  function solidAt(x, y, z) { const c = cellAt(x, y); if (c) for (const b of c) if (z > b.zb && z < b.zt) return true; return false; }
  function clearPath(x0, y0, z0, x1, y1, z1) {
    const n = Math.max(8, Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 6 | 0);
    for (let k = 1; k < n; k++) { const t = k / n; if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }

