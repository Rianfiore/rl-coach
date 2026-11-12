// Positioning/boost stats + where each player was 2 s before every goal. Usage: node tools/replay-analysis.js <rrrocket.json> <PlayerName>
const fs = require('fs');
const ME = process.argv[3];
if (!ME) { console.error('Informe o nome do jogador (veja perfil.md): node tools/replay-analysis.js <rrrocket.json> <NomeDoJogador>'); process.exit(1); }
const j = JSON.parse(fs.readFileSync(process.argv[2]));
const obj = j.objects;
const actorObj = {}, carPri = {}, priName = {}, priTeam = {}, teamNum = {}, compCar = {}, isBoost = {};
const rb = {}; // actor -> {loc, vel}
const boost = {}; // car actor -> amount 0..255
let ballId = null, playlist = null;
let scoreSeen = {}, prevScore = {};
const S = {}; // per player stats
const st = n => S[n] || (S[n] = { t: 0, own: 0, back: 0, bothFwd: 0, distBall: 0, boost: 0, zero: 0, full: 0, sup: 0, slow: 0, air: 0, goalSide: 0, nearBall: 0 });
let active = false, lastHitTeam = null, state = null, hasHit = false;
const goals = []; // {time, scoredOn, snapshot}
const hist = []; // ring buffer of snapshots for lookback
let totalActive = 0;

function snapshot(time) {
  const players = [];
  for (const car in carPri) {
    const pri = carPri[car]; const name = priName[pri]; const tm = teamNum[priTeam[pri]];
    if (name === undefined || tm === undefined || !rb[car]) continue;
    players.push({ name, team: tm, loc: rb[car].loc, vel: rb[car].vel, boost: boost[car] ?? null });
  }
  return { time, ball: ballId != null && rb[ballId] ? rb[ballId] : null, players };
}

let prevTime = null;
for (const fr of j.network_frames.frames) {
  for (const id of fr.deleted_actors) { delete rb[id]; delete carPri[id]; delete compCar[id]; if (id === ballId) ballId = null; }
  for (const a of fr.new_actors) {
    const name = obj[a.object_id]; actorObj[a.actor_id] = name;
    if (name === 'Archetypes.Ball.Ball_Default') ballId = a.actor_id;
    if (name === 'Archetypes.Teams.Team0') teamNum[a.actor_id] = 0;
    if (name === 'Archetypes.Teams.Team1') teamNum[a.actor_id] = 1;
    if (name === 'Archetypes.CarComponents.CarComponent_Boost') isBoost[a.actor_id] = true;
    if (!rb[a.actor_id] && a.initial_trajectory && a.initial_trajectory.location) rb[a.actor_id] = { loc: a.initial_trajectory.location, vel: { x: 0, y: 0, z: 0 } };
  }
  for (const u of fr.updated_actors) {
    const n = obj[u.object_id], at = u.attribute, id = u.actor_id;
    if (n === 'TAGame.RBActor_TA:ReplicatedRBState') rb[id] = { loc: at.RigidBody.location, vel: at.RigidBody.linear_velocity || { x: 0, y: 0, z: 0 } };
    else if (n === 'Engine.Pawn:PlayerReplicationInfo') carPri[id] = at.ActiveActor.actor;
    else if (n === 'Engine.PlayerReplicationInfo:PlayerName') priName[id] = at.String;
    else if (n === 'Engine.PlayerReplicationInfo:Team') priTeam[id] = at.ActiveActor.actor;
    else if (n === 'TAGame.CarComponent_TA:Vehicle') compCar[id] = at.ActiveActor.actor;
    else if (n === 'TAGame.CarComponent_Boost_TA:ReplicatedBoost') { if (compCar[id] != null) boost[compCar[id]] = at.ReplicatedBoost.boost_amount; }
    else if (n === 'TAGame.CarComponent_Boost_TA:ReplicatedBoostAmount') { if (compCar[id] != null) boost[compCar[id]] = at.Byte; }
    else if (n === 'ProjectX.GRI_X:ReplicatedGamePlaylist') playlist = at.Int;
    else if (n === 'TAGame.Ball_TA:HitTeamNum') lastHitTeam = at.Byte;
    else if (n === 'TAGame.GameEvent_TA:ReplicatedStateName') state = j.names[at.Int];
    else if (n === 'TAGame.GameEvent_Soccar_TA:bBallHasBeenHit') hasHit = at.Boolean;
    else if (n === 'Engine.TeamInfo:Score') {
      if (at.Int > (prevScore[id] || 0)) {
        const look = hist.filter(h => h.time >= fr.time - 2.6 && h.time <= fr.time - 1.4);
        goals.push({ time: fr.time, scoredOn: 1 - teamNum[id], before: look[0] || hist[0], at: snapshot(fr.time) });
      }
      prevScore[id] = at.Int;
    }
  }
  active = state === 'Active' && hasHit;
  const ball = ballId != null ? rb[ballId] : null;
  const dt = prevTime === null ? 0 : Math.min(fr.time - prevTime, 0.2);
  prevTime = fr.time;
  const snap = snapshot(fr.time);
  hist.push(snap); if (hist.length > 200) hist.shift();
  if (!active || !ball || dt <= 0) continue;
  totalActive += dt;
  // per team: who is back
  for (const tm of [0, 1]) {
    const ps = snap.players.filter(p => p.team === tm);
    const sign = tm === 0 ? 1 : -1; // y toward opponent goal
    const fwd = p => p.loc.y * sign; // larger = more forward
    if (ps.length === 2) {
      const back = fwd(ps[0]) < fwd(ps[1]) ? ps[0] : ps[1];
      st(back.name).back += dt;
      if (fwd(ps[0]) > 0 && fwd(ps[1]) > 0) { st(ps[0].name).bothFwd += dt; st(ps[1].name).bothFwd += dt; }
    }
    for (const p of ps) {
      const s = st(p.name); s.t += dt;
      if (fwd(p) < 0) s.own += dt;
      s.distBall += dt * Math.hypot(p.loc.x - ball.loc.x, p.loc.y - ball.loc.y, p.loc.z - ball.loc.z);
      if (fwd(p) < ball.loc.y * sign) s.goalSide += dt;
      if (p.boost !== null) { s.boost += dt * p.boost / 2.55; if (p.boost <= 2) s.zero += dt; if (p.boost >= 240) s.full += dt; }
      const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      if (sp >= 2200) s.sup += dt; if (sp < 1000) s.slow += dt;
      if (p.loc.z > 250) s.air += dt;
    }
  }
}
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const out = { playlist, activeMin: +(totalActive / 60).toFixed(1), players: {}, goals: [] };
for (const n in S) {
  const s = S[n];
  out.players[n] = {
    min: +(s.t / 60).toFixed(1), ownHalf: pct(s.own, s.t), lastMan: pct(s.back, s.t), bothFwd: pct(s.bothFwd, s.t),
    goalSide: pct(s.goalSide, s.t), distBall: Math.round(s.distBall / s.t), boostAvg: Math.round(s.boost / s.t),
    boost0: pct(s.zero, s.t), boostFull: pct(s.full, s.t), supersonic: pct(s.sup, s.t), slow: pct(s.slow, s.t), air: pct(s.air, s.t),
  };
}
let myTeam = null;
for (const g of goals) {
  const snap = g.before || g.at;
  const me = snap.players.find(p => p.name === ME);
  if (me) myTeam = me.team;
}
for (const g of goals) {
  const snap = g.before || g.at;
  const me = snap.players.find(p => p.name === ME), mate = snap.players.find(p => p.name !== ME && p.team === (me && me.team));
  const conceded = me ? g.scoredOn === me.team : null;
  const sign = me && me.team === 0 ? 1 : -1;
  const row = { t: Math.round(g.time), conceded };
  if (me && snap.ball) {
    const b = snap.ball.loc;
    row.meFromGoal = Math.round(me.loc.y * sign + 5120); // distance from own goal line along y
    row.mateFromGoal = mate ? Math.round(mate.loc.y * sign + 5120) : null;
    row.ballFromGoal = Math.round(b.y * sign + 5120);
    row.meGoalSide = me.loc.y * sign < b.y * sign;
    row.mateGoalSide = mate ? mate.loc.y * sign < b.y * sign : null;
    row.meBoost = me.boost == null ? null : Math.round(me.boost / 2.55);
    row.meDistBall = Math.round(Math.hypot(me.loc.x - b.x, me.loc.y - b.y, me.loc.z - b.z));
    row.meZ = Math.round(me.loc.z);
  }
  out.goals.push(row);
}
console.log(JSON.stringify(out));
