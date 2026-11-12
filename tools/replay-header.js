// Scoreboard from a .replay header (no rrrocket needed). Usage: node tools/replay-header.js <file.replay> [...]
const fs = require('fs');
function parse(buf) {
  let o = 0;
  const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  const str = () => {
    const n = i32();
    if (n === 0) return '';
    if (n < 0) { const s = buf.toString('utf16le', o, o + -n * 2 - 2); o += -n * 2; return s; }
    const s = buf.toString('latin1', o, o + n - 1); o += n; return s;
  };
  const props = () => {
    const out = {};
    for (;;) {
      const name = str();
      if (name === 'None' || name === '') return out;
      const type = str();
      const size = buf.readInt32LE(o); o += 8;
      let v;
      switch (type) {
        case 'IntProperty': v = i32(); break;
        case 'FloatProperty': v = buf.readFloatLE(o); o += 4; break;
        case 'StrProperty': case 'NameProperty': v = str(); break;
        case 'BoolProperty': v = !!buf[o]; o += 1; break;
        case 'QWordProperty': v = buf.readBigUInt64LE(o).toString(); o += 8; break;
        case 'ByteProperty': { const a = str(); if (size === 1 || a === 'None' && size <= 1) { v = a; o += size; } else { const st = o; const b = str(); v = a + ':' + b; o = st + size; } break; }
        case 'ArrayProperty': { const n = i32(); v = []; for (let k = 0; k < n; k++) v.push(props()); break; }
        case 'StructProperty': { str(); v = props(); break; }
        default: throw new Error('unknown type ' + type + ' at ' + o);
      }
      out[name] = v;
    }
  };
  u32(); u32(); // header size, crc
  const major = u32(), minor = u32();
  if (major >= 868 && minor >= 18) u32();
  const game = str();
  return { game, ...props() };
}
for (const f of process.argv.slice(2)) {
  const h = parse(fs.readFileSync(f));
  const r = {
    file: f.split(/[\\/]/).pop().slice(0, 8), date: h.Date, map: h.MapName, size: h.TeamSize,
    score: [h.Team0Score || 0, h.Team1Score || 0], frames: h.NumFrames, fps: h.RecordFPS,
    owner: h.PlayerName,
    players: (h.PlayerStats || []).map(p => ({ n: p.Name, t: p.Team, sc: p.Score, g: p.Goals, a: p.Assists, sv: p.Saves, sh: p.Shots, bot: p.bBot })),
    goals: (h.Goals || []).map(g => ({ f: g.frame, p: g.PlayerName, t: g.PlayerTeam })),
    hl: (h.HighLights || []).length,
  };
  console.log(JSON.stringify(r));
}
