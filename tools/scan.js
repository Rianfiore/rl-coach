// Scans a Rocket League capture: per frame, reads the controller overlay (A, B buttons)
// and the custom-training HUD bar (lit segments = goals, white triangle = current shot).
// Usage: node tools/scan.js <video> [fps=30] [summary|raw]   (no mode = event log)
const { spawn } = require('child_process');
const video = process.argv[2];
const fps = Number(process.argv[3] || 30);

// Region: x 150..730, y 70..100 (HUD bar) -> 580x30 ; plus overlay buttons region x 400..520, y 1140..1240 -> 120x100
const HUD = { x: 150, y: 70, w: 580, h: 30 };
const BTN = { x: 400, y: 1140, w: 120, h: 100 };

function grab(region) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-i', video, '-vf',
      `fps=${fps},crop=${region.w}:${region.h}:${region.x}:${region.y}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
    const p = spawn('ffmpeg', args);
    const chunks = [];
    p.stdout.on('data', d => chunks.push(d));
    p.stderr.on('data', d => process.stderr.write(d));
    p.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg ' + code)));
  });
}

function px(buf, frameOff, w, x, y) {
  const i = frameOff + (y * w + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
}

(async () => {
  const [hud, btn] = await Promise.all([grab(HUD), grab(BTN)]);
  const hudFrame = HUD.w * HUD.h * 3, btnFrame = BTN.w * BTN.h * 3;
  const n = Math.min(hud.length / hudFrame, btn.length / btnFrame);
  // Button sample points in BTN-local coords (full-frame A at ~428,1210 ; B at ~478,1165)
  const A = [428 - BTN.x, 1210 - BTN.y], B = [478 - BTN.x, 1165 - BTN.y];
  const avg = (buf, off, w, cx, cy) => {
    let s = [0, 0, 0], k = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const p = px(buf, off, w, cx + dx, cy + dy); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; k++;
    }
    return s.map(v => v / k);
  };
  const rows = [];
  for (let f = 0; f < n; f++) {
    const bo = f * btnFrame, ho = f * hudFrame;
    const a = avg(btn, bo, BTN.w, A[0], A[1]);
    const b = avg(btn, bo, BTN.w, B[0], B[1]);
    const aOn = a[1] > 180 && a[0] < 120 && a[2] < 120;
    const bOn = b[0] > 180 && b[1] < 100 && b[2] < 100;
    // HUD: segments along y=80 (local 10); 20 segments x from 172..693 (local 22..543)
    let lit = 0, litIdx = [];
    for (let s = 0; s < 20; s++) {
      const cx = Math.round(22 + s * 27.42);
      const p = avg(hud, ho, HUD.w, cx, 10);
      if (p[0] > 170 && p[1] > 170 && p[2] < 160) { lit++; litIdx.push(s + 1); }
    }
    // pointer: white triangle near y=88..90 (local 18..20); find segment with brightest white
    let best = -1, bestV = 0;
    for (let s = 0; s < 20; s++) {
      const cx = Math.round(22 + s * 27.42);
      const p = avg(hud, ho, HUD.w, cx, 19);
      const v = Math.min(p[0], p[1], p[2]);
      if (v > bestV) { bestV = v; best = s + 1; }
    }
    rows.push({ t: +(f / fps).toFixed(2), a: aOn, b: bOn, lit, litIdx: litIdx.join('.'), ptr: bestV > 200 ? best : 0 });
  }
  if (process.argv[4] === 'raw') { for (const r of rows) console.log(JSON.stringify(r)); return; }
  if (process.argv[4] === 'summary') {
    // Group frames by shot pointer; per shot: A onsets, flip = an A onset >= 1.6 s after the first one, goal = shot index lit during shot
    const shots = [];
    let cur = null, prevA = false;
    for (const r of rows) {
      if (r.ptr && (!cur || r.ptr !== cur.shot)) {
        if (cur && r.ptr === 1 && cur.shot === 20) { cur.end = r.t; break; }
        if (cur) cur.end = r.t;
        cur = { shot: r.ptr, start: r.t, as: [], lit: new Set() };
        shots.push(cur);
      }
      if (!cur) continue;
      if (r.a && !prevA) cur.as.push(r.t);
      prevA = r.a;
      for (const s of String(r.litIdx).split('.').filter(Boolean)) cur.lit.add(Number(s));
    }
    if (cur && cur.end === undefined) cur.end = rows[rows.length - 1].t;
    let g = 0, fl = 0, none = 0;
    for (const s of shots) {
      const jump = s.as[0];
      const flip = jump === undefined ? undefined : s.as.find(t => t - jump >= 1.6);
      const goal = s.lit.has(s.shot);
      const cat = flip !== undefined ? (goal ? 'OK' : 'FLIP') : (goal ? 'GOAL_NOFLIP' : 'NOFLIP');
      if (cat === 'OK') g++; else if (cat === 'FLIP') fl++; else none++;
      console.log([s.shot, s.start, s.end, jump ?? '-', flip ?? '-', flip !== undefined ? (flip - jump).toFixed(1) : '-', (s.end - s.start).toFixed(1), cat].join('\t'));
    }
    console.log(`TOTAL shots=${shots.length} OK=${g} FLIP=${fl} OTHER=${none}`);
    return;
  }
  // Summarize: shot changes, goal changes, A press onsets
  let prevPtr = null, prevLit = null, prevA = false;
  for (const r of rows) {
    if (r.ptr && r.ptr !== prevPtr) { console.log(`${r.t}\tSHOT ${r.ptr}`); prevPtr = r.ptr; }
    if (r.lit !== prevLit) { console.log(`${r.t}\tGOALS ${r.lit} [${r.litIdx}]`); prevLit = r.lit; }
    if (r.a && !prevA) console.log(`${r.t}\tA`);
    prevA = r.a;
  }
})();
