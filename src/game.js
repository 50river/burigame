// レベル画像プリロード（LEVELS.length）
const IMAGES = [];
function preloadImages(){
  return Promise.all(
    Array.from({length: LEVELS.length}, (_,i)=> new Promise(resolve=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>{ IMAGES[i]=img; resolve(); };
      img.onerror = ()=>{ IMAGES[i]=null; resolve(); };
      img.src = `img/${i}.png`;
    }))
  );
}

// ========== ゲーム定義 ==========
const LEVELS = [
  { name: '魚卵',   color: '#f8d568', r: 24, score: 1 },
  { name: '稚魚',   color: '#9be1fa', r: 28, score: 2 },
  { name: 'こぞくら', color: '#6ed6a1', r: 34, score: 4 },
  { name: 'ふくらぎ', color: '#3fd0c9', r: 44, score: 8 },
  { name: 'がんど',  color: '#3b82f6', r: 58, score: 16 },
  { name: 'ぶり',   color: '#c084fc', r: 78, score: 64 },
  { name: '刺身',   color: '#f472b6', r: 84, score: 96, isDish:true },
  { name: '寿司',   color: '#60a5fa', r: 88, score: 128, isDish:true },
  { name: 'ぶり大根', color: '#ff9f68', r: 88, score: 160, isDish:true },
  { name: '鰤しゃぶ', color: '#ffd166', r: 88, score: 192, isDish:true },
];

// 出現確率（序盤は低レベルが多め）
function rollLevel() {
  // ぶりおこし中は常に「ぶり」（level 5）
  if (bonusActive) return 5;
  const bag = [0,0,0, 1,1, 2]; // 低レベル寄り
  return bag[Math.floor(Math.random()*bag.length)];
}

// ========== 物理 & ゲーム状態 ==========
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const world = {
  gravity: 0.45,
  air: 0.995, // 空気抵抗
  bounce: 0.55,
  friction: 0.98,
  left: 120, right: W-120, top: 60, bottom: H-40
};

let balls = [];
let score = 0;
// ぶりおこしボーナス
let bonusActive = false;
let bonusUntil = 0;
// 海流タイム（対馬 or リマン）
let currentActive = 'none'; // 'tsushima' | 'liman' | 'none'
let currentUntil = 0;
let nextCurrentAt = Infinity;
const CURRENT_DURATION_MS = 9000;
const CURRENT_INTERVAL_MIN = 8000;
const CURRENT_INTERVAL_VAR = 6000;
let nextLevel = rollLevel();
let current = null; // まだ落としていないボール
let gameOver = false;

const uiScore = document.getElementById('score');
const nextBox = document.getElementById('nextBox');
const legendBox = document.getElementById('legend');
const fxLayer = document.getElementById('fx');
const stageEl = document.querySelector('.stage');
const bgmToggleBtn = document.getElementById('bgmToggle');
const bgmVolumeSlider = document.getElementById('bgmVolume');
const flowInfoBtn = document.getElementById('flowInfo');
const flowInfoOverlay = document.getElementById('flowInfoOverlay');
const flowCloseBtn = document.getElementById('flowClose');

// 効果音＆演出
let audioEnabled = true;
let audioCtx = null;
let bgmStarted = false;
let bgmAudio = null;
let bgmMutedPref = JSON.parse(localStorage.getItem('bgmMuted')||'false');
let bgmVolumePref = Number(localStorage.getItem('bgmVolume')||'0.35');
function ensureAudio(){
  if (!audioEnabled) return null;
  if (audioCtx) return audioCtx;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }catch(e){ audioCtx = null; }
  return audioCtx;
}
function startBgm(){
  if (bgmStarted) return;
  bgmStarted = true;
  try{
    bgmAudio = new Audio('buri.mp3');
    bgmAudio.loop = true;
    bgmAudio.volume = Math.max(0, Math.min(1, bgmVolumePref));
    bgmAudio.muted = !!bgmMutedPref;
    bgmAudio.play().catch(()=>{});
  }catch(e){ /* ignore */ }
}
function updateBgmUi(){
  if (bgmToggleBtn){ bgmToggleBtn.textContent = (bgmAudio && bgmAudio.muted) || bgmMutedPref ? 'BGM: OFF' : 'BGM: ON'; }
  if (bgmVolumeSlider){ bgmVolumeSlider.value = String(bgmAudio ? bgmAudio.volume : bgmVolumePref); }
}
if (bgmToggleBtn){
  bgmToggleBtn.addEventListener('click', ()=>{
    startBgm();
    if (bgmAudio){
      bgmAudio.muted = !bgmAudio.muted;
      bgmMutedPref = bgmAudio.muted;
      localStorage.setItem('bgmMuted', JSON.stringify(bgmMutedPref));
    } else {
      bgmMutedPref = !bgmMutedPref;
      localStorage.setItem('bgmMuted', JSON.stringify(bgmMutedPref));
    }
    updateBgmUi();
  });
}
if (bgmVolumeSlider){
  bgmVolumeSlider.addEventListener('input', ()=>{
    startBgm();
    const v = Math.max(0, Math.min(1, Number(bgmVolumeSlider.value)));
    if (bgmAudio) bgmAudio.volume = v;
    bgmVolumePref = v;
    localStorage.setItem('bgmVolume', String(v));
    updateBgmUi();
  });
  // 初期値反映
  bgmVolumeSlider.value = String(bgmVolumePref);
}
updateBgmUi();

// 海流の解説
if (flowInfoBtn){
  flowInfoBtn.addEventListener('click', ()=>{
    flowInfoOverlay.style.display = 'flex';
  });
}
if (flowCloseBtn){
  flowCloseBtn.addEventListener('click', ()=>{
    flowInfoOverlay.style.display = 'none';
  });
}

// 海流ベクトル場（対馬・リマン・渦）
function tsushimaFlow(now,x,y){
  const A1 = 0.018, T1 = 5000, k1 = 0.008;
  return {
    ax: A1 * Math.sin((now/T1)*Math.PI*2 + y*k1),
    ay: -A1*0.35 * Math.cos((now/T1)*Math.PI*2 + x*k1*0.6),
  };
}
function limanFlow(now,x,y){
  const A2 = 0.012, T2 = 7000, k2 = 0.01;
  return {
    ax: -A2 * Math.cos((now/T2)*Math.PI*2 + y*k2*0.8),
    ay:  A2*0.28 * Math.sin((now/T2)*Math.PI*2 + x*k2),
  };
}
function vortexFlow(now,x,y){
  const cx = (world.left+world.right)/2, cy=(world.top+world.bottom)/2;
  const dx = (x-cx)/240, dy=(y-cy)/240;
  const r2 = dx*dx+dy*dy;
  const Av = 0.008 * Math.exp(-r2*0.8);
  return { ax: -Av*dy, ay: Av*dx };
}
function oceanFlow(now,x,y){
  const t = tsushimaFlow(now,x,y);
  const l = limanFlow(now,x,y);
  const v = vortexFlow(now,x,y);
  return { ax: t.ax + l.ax + v.ax, ay: t.ay + l.ay + v.ay };
}
// シンプル太鼓ヒット
function taiko(time, freq=110, dur=0.25){
  const ctxa = ensureAudio(); if (!ctxa) return;
  const osc = ctxa.createOscillator();
  const gain = ctxa.createGain();
  const filt = ctxa.createBiquadFilter();
  filt.type='lowpass'; filt.frequency.value = 800;
  osc.type='sine'; osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq*0.6, time+dur*0.8);
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.exponentialRampToValueAtTime(0.8, time+0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time+dur);
  osc.connect(filt).connect(gain).connect(ctxa.destination);
  osc.start(time); osc.stop(time+dur+0.02);
}
function smallBell(time){
  const ctxa = ensureAudio(); if (!ctxa) return;
  const osc = ctxa.createOscillator();
  const gain = ctxa.createGain();
  osc.type='triangle'; osc.frequency.setValueAtTime(880, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.4, time+0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time+0.2);
  osc.connect(gain).connect(ctxa.destination);
  osc.start(time); osc.stop(time+0.25);
}
function playFestivalShort(){
  const ctxa = ensureAudio(); if (!ctxa) return;
  const t = ctxa.currentTime + 0.01;
  taiko(t, 120); taiko(t+0.12, 95);
}
function playFestivalBig(){
  const ctxa = ensureAudio(); if (!ctxa) return;
  const t = ctxa.currentTime + 0.01;
  taiko(t, 140); taiko(t+0.14, 100); taiko(t+0.28, 140); taiko(t+0.42, 85);
  smallBell(t+0.5);
}
// ぶつかり効果音（短いコツン音）
let lastHitTime = 0;
function playHit(intensity=0.4){
  const ctxa = ensureAudio(); if (!ctxa) return;
  const now = ctxa.currentTime;
  const osc = ctxa.createOscillator();
  const gain = ctxa.createGain();
  const filt = ctxa.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 1200;
  osc.type = 'square';
  const f0 = 240;
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.exponentialRampToValueAtTime(f0*0.7, now+0.04);
  const amp = Math.max(0.05, Math.min(0.3, intensity*0.25));
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(amp, now+0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now+0.08);
  osc.connect(filt).connect(gain).connect(ctxa.destination);
  osc.start(now);
  osc.stop(now+0.1);
}
function showBurst(text, x, y, kind='small'){
  const rect = canvas.getBoundingClientRect();
  const stageRect = stageEl.getBoundingClientRect();
  const scale = rect.width / canvas.width;
  const el = document.createElement('div');
  el.className = `burst ${kind} anim`;
  el.textContent = text;
  el.style.left = (x*scale + rect.left - stageRect.left) + 'px';
  el.style.top  = (y*scale + rect.top  - stageRect.top)  + 'px';
  el.style.transform = 'translate(-50%, -50%)';
  fxLayer.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 950);
}

// レジェンド描画（画像が無ければ色ドットにフォールバック）
LEVELS.forEach((lv,i)=>{
  const div = document.createElement('div');
  div.className='pill';
  const img = new Image();
  img.className = 'thumb';
  img.alt = lv.name;
  img.src = `img/${i}.png`;
  img.onerror = ()=>{
    img.remove();
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = lv.color;
    div.insertBefore(dot, div.firstChild);
  };
  div.appendChild(img);
  const label = document.createElement('span');
  label.textContent = `${i+1}. ${lv.name}`;
  div.appendChild(label);
  legendBox.appendChild(div);
});

function renderNext() {
  nextBox.innerHTML = '';
  const lv = LEVELS[nextLevel];
  const img = new Image();
  img.className = 'thumb';
  img.alt = lv.name;
  img.src = `img/${nextLevel}.png`;
  img.onerror = ()=>{
    img.remove();
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = lv.color;
    nextBox.insertBefore(dot, nextBox.firstChild);
  };
  const label = document.createElement('span');
  label.textContent = lv.name + (bonusActive? '（ぶりおこし中）':'');
  nextBox.appendChild(img);
  nextBox.appendChild(label);
}
renderNext();

function spawnHeld() {
  if (current) return;
  const lv = LEVELS[nextLevel];
  current = {
    x: (world.left + world.right)/2,
    y: world.top + lv.r + 4,
    vx: 0, vy: 0,
    r: lv.r,
    level: nextLevel,
    isHeld: true,
    id: crypto.randomUUID(),
  };
  nextLevel = rollLevel();
  renderNext();
}

function dropHeld() {
  if (!current || gameOver) return;
  if (!canDropNow()) return;
  current.isHeld = false;
  // 位置に微小な揺らぎ（同一点スタック対策）
  const jitter = (Math.random()*2-1) * current.r*0.3;
  current.x = clamp(current.x + jitter, world.left+current.r, world.right-current.r);
  // 初速も少し与える（左右キー操作で強めに）
  const keyKick = (KEYS.right?0.8:0) + (KEYS.left?-0.8:0);
  const randKick = (Math.random()*2-1) * 0.8;
  current.vx += keyKick + randKick;
  balls.push(current);
  lastDroppedBall = current;
  lastDropTime = performance.now();
  // 次の予告を更新（ボーナス中はぶり）
  nextLevel = rollLevel();
  renderNext();
  current = null;
}

// ========== 入力 ==========
const KEYS = { left:false, right:false };
window.addEventListener('keydown', e=>{
  if (e.code==='ArrowLeft' || e.code==='KeyA' || e.code==='ArrowRight' || e.code==='KeyD' || e.code==='Space'){
    e.preventDefault();
  }
  if (e.code==='ArrowLeft' || e.code==='KeyA') KEYS.left=true;
  if (e.code==='ArrowRight'|| e.code==='KeyD') KEYS.right=true;
  if (e.code==='Space') dropQueued = true;
  if (e.code==='KeyR') hardReset();
  ensureAudio();
  startBgm();
});
window.addEventListener('keyup', e=>{
  if (e.code==='ArrowLeft' || e.code==='KeyA') KEYS.left=false;
  if (e.code==='ArrowRight'|| e.code==='KeyD') KEYS.right=false;
});
document.getElementById('dropBtn').onclick = ()=>{ dropQueued = true; };
document.getElementById('resetBtn').onclick = hardReset;

// ドロップ連打対策 + 入力バッファ
let lastDropTime = 0;
let lastDroppedBall = null;
let dropQueued = false;
const dropCooldownMs = 380; // 最低インターバル
const dropFlightMs = 300;   // 最低飛行時間
function canDropNow(){
  const now = performance.now();
  if (!current) return false; // 保持中の玉が必要
  if (now - lastDropTime < dropCooldownMs) return false;
  // 直前の玉がある場合は、一定時間経過 or 一定高さまで下がるのを待つ
  if (lastDroppedBall){
    if (now - lastDropTime > dropFlightMs) return true;
    if (lastDroppedBall.y > world.top + 80) return true;
    return false;
  }
  return true;
}

// スマホ/タッチ・ポインタ操作
let pointerActive = false;
function clientToCanvasX(clientX){
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (canvas.width / rect.width);
}
function setCurrentXFromClientX(clientX){
  if (!current) return;
  const x = clientToCanvasX(clientX);
  current.x = clamp(x, world.left+current.r, world.right-current.r);
}
canvas.addEventListener('pointerdown', (e)=>{
  e.preventDefault();
  ensureAudio();
  startBgm();
  pointerActive = true;
  setCurrentXFromClientX(e.clientX);
});
canvas.addEventListener('pointermove', (e)=>{
  if (!pointerActive) return;
  setCurrentXFromClientX(e.clientX);
});
canvas.addEventListener('pointerup', (e)=>{
  if (!pointerActive) return;
  pointerActive = false;
  dropHeld();
});

// ========== ユーティリティ ==========
function circleOverlap(a,b){
  const dx=b.x-a.x, dy=b.y-a.y; const d=Math.hypot(dx,dy);
  return d < a.r + b.r;
}
function closeEnough(a,b){
  const dx=b.x-a.x, dy=b.y-a.y; const d=Math.hypot(dx,dy);
  return d <= a.r + b.r + 0.8; // 0.8px のマージン
}
const COLLISION_LIMIT = 3;
function resolveCircle(a,b, collisionCounts){
  const dx=b.x-a.x, dy=b.y-a.y; let d=Math.hypot(dx,dy);
  if (d===0) { d=0.01; }
  const overlap = a.r + b.r - d;
  let adjusted = false;
  if (overlap>0){
    const countA = collisionCounts.get(a.id) || 0;
    const countB = collisionCounts.get(b.id) || 0;
    const limitReached = countA >= COLLISION_LIMIT || countB >= COLLISION_LIMIT;
    const nx = dx/d, ny = dy/d;
    // 位置を押し出す
    const m1 = a.r, m2 = b.r; // 簡易質量
    const total = m1+m2;
    a.x -= nx * overlap * (m2/total);
    a.y -= ny * overlap * (m2/total);
    b.x += nx * overlap * (m1/total);
    b.y += ny * overlap * (m1/total);
    keepBallInside(a);
    keepBallInside(b);
    adjusted = true;
    collisionCounts.set(a.id, Math.min(COLLISION_LIMIT, countA + 1));
    collisionCounts.set(b.id, Math.min(COLLISION_LIMIT, countB + 1));
    // 反発（簡易）
    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const relSpeedSq = relVx*relVx + relVy*relVy;
    const settleSpeed = 0.45; // しきい値より遅い接触は滑らかに減速
    if (limitReached || relSpeedSq < settleSpeed*settleSpeed){
      const avgVx = (a.vx*m1 + b.vx*m2)/total;
      const avgVy = (a.vy*m1 + b.vy*m2)/total;
      a.vx = avgVx; a.vy = avgVy;
      b.vx = avgVx; b.vy = avgVy;
      // 微小な速度は完全に止めて振動を防ぐ
      if (Math.abs(a.vx)<0.05) a.vx=0;
      if (Math.abs(a.vy)<0.05) a.vy=0;
      if (Math.abs(b.vx)<0.05) b.vx=0;
      if (Math.abs(b.vy)<0.05) b.vy=0;
      return true;
    }
    const vn = relVx*nx + relVy*ny;
    if (vn<0){
      const vnAbs = Math.abs(vn);
      const e = (vnAbs < 0.9) ? 0.0 : world.bounce; // 低速時は無反発
      const imp = -(1+e)*vn/(1/m1+1/m2);
      const ix = imp*nx, iy = imp*ny;
      a.vx -= ix/m1; a.vy -= iy/m1;
      b.vx += ix/m2; b.vy += iy/m2;
      // 低速接触時の接線減衰で振動を抑える
      if (vnAbs < 0.9){
        const tx = -ny, ty = nx;
        const vt = relVx*tx + relVy*ty;
        const mu = 0.02;
        const jft = -vt*mu/(1/m1+1/m2);
        a.vx -= jft*tx/m1; a.vy -= jft*ty/m1;
        b.vx += jft*tx/m2; b.vy += jft*ty/m2;
      }
      // ごく小さい速度はゼロ止め
      if (Math.abs(a.vx)<0.04) a.vx=0; if (Math.abs(a.vy)<0.04) a.vy=0;
      if (Math.abs(b.vx)<0.04) b.vx=0; if (Math.abs(b.vy)<0.04) b.vy=0;
      // ぶつかり音（スパム防止の簡易スロットル）
      const nowMs = performance.now();
      const speed = Math.min(1.0, (-vn)/8); // 当たり強度
      if (speed > 0.12 && nowMs - lastHitTime > 70){
        playHit(speed);
        lastHitTime = nowMs;
      }
    }
  }
  return adjusted;
}
function clamp(val,min,max){return Math.max(min,Math.min(max,val));}
function keepBallInside(b){
  const left = world.left + b.r;
  const right = world.right - b.r;
  const top = world.top + b.r;
  const bottom = world.bottom - b.r;
  if (b.x < left){
    b.x = left;
    if (b.vx < 0) b.vx = 0;
  }
  if (b.x > right){
    b.x = right;
    if (b.vx > 0) b.vx = 0;
  }
  if (b.y < top){
    b.y = top;
    if (b.vy < 0) b.vy = 0;
  }
  if (b.y > bottom){
    b.y = bottom;
    if (b.vy > 0) b.vy = 0;
  }
}

// ========== メインループ ==========
let last = performance.now();
function tick(now){
  const dt = Math.min(33, now-last); // ms（未使用でも将来のため残す）
  last = now;
  // 合成流（対馬×リマン＋渦）可視化用。物理への適用は海流タイム時のみ。

  if (currentActive === 'none' && now >= nextCurrentAt){
    const mode = Math.random()<0.5 ? 'tsushima' : 'liman';
    const cx = (world.left + world.right)/2;
    const cy = world.top + 120;
    startCurrentTime(now, mode, cx, cy);
  }

  // 保持中のボールを左右移動
  if (current){
    const speed = 6;
    if (KEYS.left) current.x -= speed;
    if (KEYS.right) current.x += speed;
    current.x = clamp(current.x, world.left+current.r, world.right-current.r);
    // ドロップがキューされていれば、条件を満たしたタイミングで落とす
    if (dropQueued && canDropNow()){
      dropHeld();
      dropQueued = false;
    }
  } else if (!gameOver) {
    // 新しいボールを供給
    spawnHeld();
    // 供給直後にドロップがキューされていたら、即ドロップを試行
    if (dropQueued && canDropNow()){
      dropHeld();
      dropQueued = false;
    }
  }

  // 物理更新
  for (const b of balls){
    // 重力
    b.vy += world.gravity;
    // 抵抗
    b.vx *= world.air;
    b.vy *= world.air;
    // 海流タイム時のみ一方向への流れを適用
    if (currentActive !== 'none'){
      const dir = currentActive === 'tsushima' ? 1 : -1; // 対馬=右へ、リマン=左へ
      const strength = 0.065; // 流れの強さ
      b.vx += dir * strength;
    }
    // 位置更新
    b.x += b.vx;
    b.y += b.vy;

    // 壁との衝突（バブル半径で判定）
    if (b.x - b.r < world.left){ b.x = world.left + b.r; b.vx = -b.vx * world.bounce; }
    if (b.x + b.r > world.right){ b.x = world.right - b.r; b.vx = -b.vx * world.bounce; }
    if (b.y + b.r > world.bottom){
      b.y = world.bottom - b.r;
      if (Math.abs(b.vy) < 0.9){
        b.vy = 0;
        b.vx *= 0.96;
      } else {
        b.vy = -Math.abs(b.vy) * world.bounce;
        b.vx *= world.friction;
      }
    }
    keepBallInside(b);
    // 終了条件チェックはループ後にまとめて行う
  }

  // 円同士の衝突解決 & マージ
  // 1) 位置解決 + 反発（円ベース）
  const collisionCounts = new Map();
  for (let iter=0; iter<5; iter++){
    let anyAdjust = false;
    for (let i=0;i<balls.length;i++){
      for (let j=i+1;j<balls.length;j++){
        if (resolveCircle(balls[i], balls[j], collisionCounts)) anyAdjust = true;
      }
    }
    if (!anyAdjust) break;
  }
  // 2) マージ（必ず触れたら合体）
  outer: for (let i=0;i<balls.length;i++){
    for (let j=i+1;j<balls.length;j++){
      const a=balls[i], b=balls[j];
      if (!closeEnough(a,b)) continue; // バブル同士の接触

      // 同レベルのみ合体（異レベルは何もしない）
      if (a.level===b.level){
        const nx=(a.x+b.x)/2, ny=(a.y+b.y)/2;
        // 0〜4: 通常の出世
        if (a.level < 5){
          const nl = a.level+1;
          const nb = { x:nx, y:ny, vx:(a.vx+b.vx)/2, vy:-6, r:LEVELS[nl].r, level:nl, id:crypto.randomUUID() };
          // 効果音
          playFestivalShort();
          // 合体後のアイテム名を表示
          showBurst(LEVELS[nl].name, nx, ny-20, 'small');
          score += LEVELS[a.level].score;
          balls.splice(j,1); balls.splice(i,1);
          balls.push(nb);
          maybeStartBuriOkoshi(now, nx, ny);
          break outer;
        }
        // 5: ぶり → 6: 刺身
        if (a.level === 5){
          const nl = 6;
          const nb = { x:nx, y:ny, vx:(a.vx+b.vx)/2, vy:-6, r:LEVELS[nl].r, level:nl, id:crypto.randomUUID() };
          // 効果音（寒ブリ祭り！／煌）
          playFestivalBig();
          showBurst(Math.random()<0.5 ? '寒ブリ祭り！' : '煌', nx, ny-28, Math.random()<0.5 ? 'big' : 'kira');
          // 合体後のアイテム名も表示
          showBurst(LEVELS[nl].name, nx, ny+6, 'small');
          score += LEVELS[a.level].score;
          balls.splice(j,1); balls.splice(i,1);
          balls.push(nb);
          maybeStartBuriOkoshi(now, nx, ny);
          break outer;
        }
        // 6〜8: 刺身→寿司→ぶり大根→鰤しゃぶ
        if (a.level >= 6 && a.level <= 8){
          const nl = a.level + 1;
          const nb = { x:nx, y:ny, vx:(a.vx+b.vx)/2, vy:-6, r:LEVELS[nl].r, level:nl, id:crypto.randomUUID() };
          playFestivalShort();
          showBurst(LEVELS[nl].name, nx, ny-20, 'small');
          score += LEVELS[a.level].score;
          balls.splice(j,1); balls.splice(i,1);
          balls.push(nb);
          maybeStartBuriOkoshi(now, nx, ny);
          break outer;
        }
        // 9: 鰤しゃぶ → 合体で消滅（ボーナス）
        if (a.level === 9){
          playFestivalBig();
          showBurst('煌', nx, ny-20, 'kira');
          balls.splice(j,1); balls.splice(i,1);
          score += LEVELS[a.level].score;
          break outer;
        }
      }
    }
  }

  // 終了条件チェック（持続的に上端を越えた場合のみ）
  let anyOver = false;
  for (const b of balls){
    if (b.y - b.r < world.top - 8){ anyOver = true; break; }
  }
  if (anyOver){
    if (!tick._overTopStart) tick._overTopStart = now;
    // 0.8秒以上継続でゲームオーバー
    if (now - tick._overTopStart > 800){
      triggerGameOver();
    }
  } else {
    tick._overTopStart = null;
  }

  // ボーナス終了チェック
  if (bonusActive && now > bonusUntil){
    bonusActive = false;
    showBurst('ぶりおこし 終了', (world.left+world.right)/2, world.top+40, 'small');
  }
  if (currentActive !== 'none' && now > currentUntil){
    const ended = currentActive; currentActive = 'none';
    showBurst(`${ended==='tsushima'?'対馬海流':'リマン海流'}タイム 終了`, (world.left+world.right)/2, world.top+60, 'small');
    scheduleNextCurrent(now);
  }

  draw();

  // スコア表示
  uiScore.textContent = score.toLocaleString();

  if (!gameOver) requestAnimationFrame(tick);
}

function draw(){
  // 背景（海 + ガイド）
  ctx.clearRect(0,0,W,H);
  // 境界枠
  ctx.save();
  ctx.strokeStyle = 'rgba(160,190,255,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(world.left, world.top);
  ctx.lineTo(world.left, world.bottom);
  ctx.lineTo(world.right, world.bottom);
  ctx.lineTo(world.right, world.top);
  ctx.closePath();
  ctx.stroke();

  // 海中の泡（下から上へ）。海流タイム中は流れ方向にドリフト。
  for (let i=0;i<16;i++){
    const span = (world.bottom - world.top);
    const t = performance.now();
    const up = (t/30 + i*60) % span; // 下→上への進行量
    let y = world.bottom - up;
    let x = world.left + ((i*137)% (world.right-world.left));
    if (currentActive !== 'none'){
      const dir = currentActive==='tsushima' ? 1 : -1; // tsushima: →, liman: ←
      const drift = up * 0.08; // 斜め流れの強さ
      x += dir * drift;
      // 境界内にクランプ
      if (x < world.left) x = world.left + 6;
      if (x > world.right) x = world.right - 6;
    }
    ctx.globalAlpha = 0.06;
    ctx.beginPath(); ctx.arc(x,y, 8 + (i%3)*3, 0, Math.PI*2); ctx.fillStyle = '#9bd1ff'; ctx.fill();
    ctx.globalAlpha = 1;
  }


  // 保持中の影
  if (current){
    ctx.globalAlpha = 0.2;
    drawBall({...current});
    ctx.globalAlpha = 1;
    // 上部のドロップレーン
    ctx.fillStyle='rgba(200,230,255,.08)';
    ctx.fillRect(world.left, world.top, world.right-world.left, 60);
  }

  // ボール
  for (const b of balls) drawBall(b);

  // ボーナスタイム帯（上部リボン）
  if (bonusActive){
    const tLeft = Math.max(0, Math.ceil((bonusUntil - performance.now())/1000));
    ctx.fillStyle = 'rgba(255,215,0,0.12)';
    ctx.fillRect(world.left, world.top-58, world.right-world.left, 42);
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 20px system-ui, -apple-system';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`ぶりおこし中！ 残り ${tLeft} 秒`, (world.left+world.right)/2, world.top-37);
  }
  // 海流タイム帯（上部リボン）
  if (currentActive !== 'none'){
    const tLeft = Math.max(0, Math.ceil((currentUntil - performance.now())/1000));
    const warm = currentActive==='tsushima';
    ctx.fillStyle = warm ? 'rgba(255,160,120,0.12)' : 'rgba(120,180,255,0.12)';
    ctx.fillRect(world.left, world.top-16, world.right-world.left, 26);
    ctx.fillStyle = warm ? '#ffb3a1' : '#9fd0ff';
    ctx.font = 'bold 16px system-ui, -apple-system';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${warm?'対馬海流':'リマン海流'}タイム 残り ${tLeft} 秒`, (world.left+world.right)/2, world.top-3);
  }

  ctx.restore();
}

function drawBall(b){
  const lv = LEVELS[b.level];
  const img = IMAGES[b.level];
  const r = b.r;
  const size = r * 2;

  // 中身（画像）を円でクリップして描画
  ctx.save();
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI*2); ctx.clip();
  if (img){
    ctx.drawImage(img, b.x - r, b.y - r, size, size);
  } else {
    // フォールバック（円グラデ）
    const g = ctx.createRadialGradient(b.x-r*0.4, b.y-r*0.6, r*0.2, b.x, b.y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.15, lv.color);
    g.addColorStop(1, shade(lv.color,-0.35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x,b.y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();

  // バブルっぽい縁・ハイライト
  ctx.save();
  // 外枠
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, r-1, 0, Math.PI*2); ctx.stroke();
  // 上部ハイライト
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1.5, r*0.06);
  ctx.arc(b.x - r*0.25, b.y - r*0.35, r*0.7, -Math.PI*0.2, Math.PI*0.5);
  ctx.stroke();
  // 右下の薄い反射
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = Math.max(1, r*0.04);
  ctx.arc(b.x + r*0.25, b.y + r*0.25, r*0.7, Math.PI*0.8, Math.PI*1.2);
  ctx.stroke();
  ctx.restore();
}

// ぶりおこし（一定時間ぶりのみ出現）
function startBuriOkoshi(now, x, y){
  if (bonusActive) return;
  bonusActive = true;
  bonusUntil = now + 12000; // 12秒
  playFestivalBig();
  showBurst('ぶりおこし', x, y-28, 'big');
  // 予告を即時ぶりに
  nextLevel = 5; renderNext();
}
function maybeStartBuriOkoshi(now, x, y){
  if (bonusActive) return;
  // 合体時にランダムで発生（確率 3% に調整）
  if (Math.random() < 0.03){
    startBuriOkoshi(now, x, y);
  }
}

// 海流タイム（対馬 or リマン）
function startCurrentTime(now, mode, x, y){
  if (currentActive !== 'none') return;
  currentActive = mode; // 'tsushima' or 'liman'
  currentUntil = now + CURRENT_DURATION_MS; // 9秒
  nextCurrentAt = Infinity;
  if (mode==='tsushima'){
    showBurst('対馬海流', x, y-28, 'big');
  } else {
    showBurst('リマン海流', x, y-28, 'big');
  }
}

function scheduleNextCurrent(now){
  nextCurrentAt = now + CURRENT_INTERVAL_MIN + Math.random()*CURRENT_INTERVAL_VAR;
}

function shade(hex, lum){
  // #rrggbb → 明暗調整
  hex = String(hex).replace(/[^0-9a-f]/gi,'');
  if (hex.length<6) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  let rgb = '#';
  for (let i=0;i<3;i++){
    let c = parseInt(hex.substr(i*2,2),16);
    c = Math.round(Math.min(Math.max(0, c + (c*lum)), 255));
    rgb += ('00'+c.toString(16)).substr(-2);
  }
  return rgb;
}

function triggerGameOver(){
  if (gameOver) return;
  gameOver = true;
  document.getElementById('finalScore').textContent = score.toLocaleString();
  document.getElementById('gameover').style.display = 'flex';
}

function hardReset(){
  balls = [];
  score = 0;
  nextLevel = rollLevel();
  renderNext();
  current = null;
  gameOver = false;
  currentActive = 'none';
  currentUntil = 0;
  nextCurrentAt = Infinity;
  document.getElementById('gameover').style.display = 'none';
  last = performance.now();
  scheduleNextCurrent(last + 2000);
  spawnHeld();
  requestAnimationFrame(tick);
}

document.getElementById('again').onclick = hardReset;
document.getElementById('quit').onclick = ()=>{
  document.getElementById('gameover').style.display = 'none';
};

// 初期化（画像ロード後に開始）
preloadImages().then(()=>{
  hardReset();
});
