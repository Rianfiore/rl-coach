// Highlights: in-game flip resets, demos, fastest/highest touches, how each of the player goals happened. Usage: node tools/replay-highlights.js <rrrocket.json> <PlayerName>
const fs = require('fs');
const ME = process.argv[3];
if (!ME) { console.error('Informe o nome do jogador (veja perfil.md): node tools/replay-highlights.js <rrrocket.json> <NomeDoJogador>'); process.exit(1); }
const j = JSON.parse(fs.readFileSync(process.argv[2]));
const o = j.objects, F = j.network_frames.frames;
const carPri = {}, priName = {}, rb = {}, priStat = {}, refresh = {}, priTeam = {}, teamNum = {};
let ballId = null, state = null, clockSec = null;
const resets = [], demos = [], touches = [], events = [];
const kmh = v => Math.round(Math.hypot(v.x, v.y, v.z) * 0.036);
const nameOfCar = c => priName[carPri[c]];
for (let fi = 0; fi < F.length; fi++) {
  const fr = F[fi];
  for (const a of fr.new_actors) {
    const n = o[a.object_id];
    if (n === 'Archetypes.Ball.Ball_Default') ballId = a.actor_id;
    if (n === 'Archetypes.Teams.Team0') teamNum[a.actor_id] = 0;
    if (n === 'Archetypes.Teams.Team1') teamNum[a.actor_id] = 1;
  }
  const prevBall = ballId != null && rb[ballId] ? rb[ballId] : null;
  for (const u of fr.updated_actors) {
    const n = o[u.object_id], at = u.attribute, id = u.actor_id;
    if (n === 'TAGame.RBActor_TA:ReplicatedRBState') rb[id] = { loc: at.RigidBody.location, vel: at.RigidBody.linear_velocity || { x: 0, y: 0, z: 0 } };
    else if (n === 'Engine.Pawn:PlayerReplicationInfo') carPri[id] = at.ActiveActor.actor;
    else if (n === 'Engine.PlayerReplicationInfo:PlayerName') priName[id] = at.String;
    else if (n === 'Engine.PlayerReplicationInfo:Team') priTeam[id] = at.ActiveActor.actor;
    else if (n === 'TAGame.GameEvent_TA:ReplicatedStateName') state = j.names[at.Int];
    else if (n === 'TAGame.GameEvent_Soccar_TA:SecondsRemaining') clockSec = at.Int;
    else if (/^TAGame\.PRI_TA:(BallTouches|MatchAerialHits|MatchCenters|MatchClears|MatchFirstTouches|MatchEpicSaves|MatchSaves|MatchDemolishes|MatchTimesDemolished|MatchShots|MatchGoals)$/.test(n)) {
      (priStat[id] = priStat[id] || {})[n.split(':')[1]] = at.Int;
    } else if (n === 'TAGame.Car_TA:DodgesRefreshedCounter') {
      const prev = refresh[id];
      refresh[id] = at.Int;
      if (prev !== undefined && at.Int > prev && state === 'Active') {
        const car = rb[id], ball = ballId != null ? rb[ballId] : null;
        resets.push({ t: fr.time, fi, who: nameOfCar(id), carZ: car ? Math.round(car.loc.z) : null, dBall: car && ball ? Math.round(Math.hypot(car.loc.x - ball.loc.x, car.loc.y - ball.loc.y, car.loc.z - ball.loc.z)) : null, clock: clockSec });
      }
    } else if (n === 'TAGame.Car_TA:ReplicatedDemolishExtended' || n === 'TAGame.Car_TA:ReplicatedDemolish') {
      const d = at.DemolishExtended || at.Demolish;
      if (d) demos.push({ t: fr.time, att: nameOfCar(d.attacker.actor), vic: nameOfCar(d.victim.actor) });
    } else if (n === 'TAGame.GameEvent_Soccar_TA:ReplicatedStatEvent') {
      events.push({ t: fr.time, ev: (o[at.StatEvent.object_id] || '').split('.').pop() });
    }
  }
  // touch detection: ball velocity change > 300 uu/s and a car close
  const ball = ballId != null ? rb[ballId] : null;
  if (state === 'Active' && prevBall && ball && ball !== prevBall) {
    const dv = Math.hypot(ball.vel.x - prevBall.vel.x, ball.vel.y - prevBall.vel.y, ball.vel.z - prevBall.vel.z);
    if (dv > 400) {
      let best = null, bd = 1e9;
      for (const c in carPri) { const car = rb[c]; if (!car) continue; const d = Math.hypot(car.loc.x - ball.loc.x, car.loc.y - ball.loc.y, car.loc.z - ball.loc.z); if (d < bd) { bd = d; best = c; } }
      if (best && bd < 320) {
        const last = touches[touches.length - 1];
        const who = nameOfCar(best);
        if (!(last && last.who === who && fr.time - last.t < 0.25))
          touches.push({ t: fr.time, who, team: teamNum[priTeam[carPri[best]]], carZ: Math.round(rb[best].loc.z), ballZ: Math.round(ball.loc.z), speed: kmh(ball.vel), ballY: Math.round(ball.loc.y), clock: clockSec });
      }
    }
  }
}
// goals from header
const goals = (j.properties.Goals || []).map(g => ({ t: F[g.frame].time, who: g.PlayerName, team: g.PlayerTeam }));
const out = { stats: {}, resets: resets.filter(r => r.who === ME), allResets: resets.length, demos: demos.filter(d => d.att === ME || d.vic === ME), myGoals: [] };
for (const p in priStat) if (priName[p]) out.stats[priName[p]] = priStat[p];
for (const g of goals.filter(g => g.who === ME)) {
  const mine = touches.filter(t => t.who === ME && t.t <= g.t && g.t - t.t < 6);
  const lt = mine[mine.length - 1];
  const prev = touches.filter(t => t.t < g.t && g.t - t.t < 8).slice(-4).map(t => `${t.who === ME ? 'EU' : t.who.slice(0, 6)}@z${t.carZ}`);
  const rs = resets.filter(r => r.who === ME && g.t - r.t < 6 && r.t <= g.t);
  out.myGoals.push({ t: Math.round(g.t), clock: lt && lt.clock, shotKmh: lt && lt.speed, carZ: lt && lt.carZ, ballZ: lt && lt.ballZ, distGoal: lt ? Math.round(5120 - Math.abs(lt.ballY)) : null, chain: prev.join(' > '), resetBefore: rs.length });
}
// my best touches
const my = touches.filter(t => t.who === ME);
out.touchCount = my.length;
out.fastest = [...my].sort((a, b) => b.speed - a.speed).slice(0, 3).map(t => ({ t: Math.round(t.t), kmh: t.speed, carZ: t.carZ }));
out.highest = [...my].sort((a, b) => b.carZ - a.carZ).slice(0, 3).map(t => ({ t: Math.round(t.t), carZ: t.carZ, kmh: t.speed }));
out.events = events.filter(e => e.ev).length;
console.log(JSON.stringify(out));
