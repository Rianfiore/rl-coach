// Lê o overlay do ControllerOverlay quadro a quadro: A, B, RB, LB e a posição do analógico esquerdo.
// Uso: node tools/overlay.js <video> [fps=60] [ox oy]
//   ox,oy = canto de referência do overlay em 2560x1440. Padrão 30,850 (layout do vídeo de 2026-11-11 23-08-36).
//   Para o layout antigo do scan.js (A em 428,1210), use ox=97 oy=978 (vídeo de referência 23-03-47).
// Saída: uma linha JSON por quadro: {t,a,b,rb,lb,sx,sy}
//   sx,sy = deslocamento do analógico em relação ao centro do anel, em fração do raio (sy<0 = frente, sy>0 = trás).
const { spawn } = require('child_process');
const video = process.argv[2];
const fps = Number(process.argv[3] || 60);
const ox = Number(process.argv[4] || 30), oy = Number(process.argv[5] || 850);
const W = 440, H = 280;
// Pontos em coordenadas locais (recorte 440x280 a partir de ox,oy)
const P = { A: [343, 246], B: [391, 197], RB: [306, 64], LB: [50, 64], RING: [88, 185] };
const RADIUS = 48;

const args = ['-v', 'error', '-i', video, '-vf', `fps=${fps},crop=${W}:${H}:${ox}:${oy}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
const p = spawn('ffmpeg', args);
const chunks = [];
p.stdout.on('data', d => chunks.push(d));
p.stderr.on('data', d => process.stderr.write(d));
p.on('close', () => {
  const buf = Buffer.concat(chunks), FS = W * H * 3, n = Math.floor(buf.length / FS);
  const px = (o, x, y) => { const i = o + (y * W + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
  const avg = (o, [cx, cy]) => { const s = [0, 0, 0]; let k = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = px(o, cx + dx, cy + dy); s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; k++; }
    return s.map(v => v / k); };
  for (let f = 0; f < n; f++) {
    const o = f * FS;
    const a = avg(o, P.A), b = avg(o, P.B), rb = avg(o, P.RB), lb = avg(o, P.LB);
    // analógico: centróide dos pixels cinza (não branco, não preto) perto do anel
    let sx = 0, sy = 0, k = 0;
    for (let y = P.RING[1] - 75; y <= P.RING[1] + 75; y++) for (let x = P.RING[0] - 75; x <= P.RING[0] + 75; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const [r, g, bl] = px(o, x, y), mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
      if (mx - mn < 20 && mn > 110 && mx < 215) { sx += x; sy += y; k++; }
    }
    const row = {
      t: +(f / fps).toFixed(3),
      a: a[1] > 180 && a[0] < 120 && a[2] < 120,
      b: b[0] > 180 && b[1] < 100 && b[2] < 100,
      rb: Math.min(...rb) > 200,
      lb: Math.min(...lb) > 200,
      sx: k > 200 ? +((sx / k - P.RING[0]) / RADIUS).toFixed(2) : null,
      sy: k > 200 ? +((sy / k - P.RING[1]) / RADIUS).toFixed(2) : null,
    };
    console.log(JSON.stringify(row));
  }
});
