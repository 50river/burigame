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
let nextLevel = rollLevel();
let current = null; // まだ落としていないボール
let gameOver = false;

const uiScore = document.getElementById('score');
const nextBox = document.getElementById('nextBox');
const legendBox = document.getElementById('legend');
const fxLayer = document.getElementById('fx');
const stageEl = document.querySelector('.stage');

// 効果音＆演出
let audioEnabled = true;
let audioCtx = null;
function ensureAudio(){
  if (!audioEnabled) return null;
  if (audioCtx) return audioCtx;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }catch(e){ audioCtx = null; }
  return audioCtx;
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
  label.textContent = lv.name;
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
  current.isHeld = false;
  balls.push(current);
  current = null;
}

// ========== 入力 ==========
const KEYS = { left:false, right:false };
window.addEventListener('keydown', e=>{
  if (e.code==='ArrowLeft' || e.code==='KeyA') KEYS.left=true;
  if (e.code==='ArrowRight'|| e.code==='KeyD') KEYS.right=true;
  if (e.code==='Space') dropHeld();
  if (e.code==='KeyR') hardReset();
  ensureAudio();
});
window.addEventListener('keyup', e=>{
  if (e.code==='ArrowLeft' || e.code==='KeyA') KEYS.left=false;
  if (e.code==='ArrowRight'|| e.code==='KeyD') KEYS.right=false;
});
document.getElementById('dropBtn').onclick = dropHeld;
document.getElementById('resetBtn').onclick = hardReset;

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
function resolveCircle(a,b){
  const dx=b.x-a.x, dy=b.y-a.y; let d=Math.hypot(dx,dy);
  if (d===0) { d=0.01; }
  const overlap = a.r + b.r - d;
  if (overlap>0){
    const nx = dx/d, ny = dy/d;
    // 位置を押し出す
    const m1 = a.r, m2 = b.r; // 簡易質量
    const total = m1+m2;
    a.x -= nx * overlap * (m2/total);
    a.y -= ny * overlap * (m2/total);
    b.x += nx * overlap * (m1/total);
    b.y += ny * overlap * (m1/total);
    // 反発（簡易）
    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const vn = relVx*nx + relVy*ny;
    if (vn<0){
      const imp = -(1+world.bounce)*vn/(1/m1+1/m2);
      const ix = imp*nx, iy = imp*ny;
      a.vx -= ix/m1; a.vy -= iy/m1;
      b.vx += ix/m2; b.vy += iy/m2;
    }
  }
}
function clamp(val,min,max){return Math.max(min,Math.min(max,val));}

// ========== メインループ ==========
let last = performance.now();
function tick(now){
  const dt = Math.min(33, now-last); // ms（未使用でも将来のため残す）
  last = now;

  // 保持中のボールを左右移動
  if (current){
    const speed = 6;
    if (KEYS.left) current.x -= speed;
    if (KEYS.right) current.x += speed;
    current.x = clamp(current.x, world.left+current.r, world.right-current.r);
  } else if (!gameOver) {
    // 新しいボールを供給
    spawnHeld();
  }

  // 物理更新
  for (const b of balls){
    // 重力
    b.vy += world.gravity;
    // 抵抗
    b.vx *= world.air;
    b.vy *= world.air;
    // 位置更新
    b.x += b.vx;
    b.y += b.vy;

    // 壁との衝突（バブル半径で判定）
    if (b.x - b.r < world.left){ b.x = world.left + b.r; b.vx = -b.vx * world.bounce; }
    if (b.x + b.r > world.right){ b.x = world.right - b.r; b.vx = -b.vx * world.bounce; }
    if (b.y + b.r > world.bottom){ b.y = world.bottom - b.r; b.vy = -Math.abs(b.vy) * world.bounce; b.vx *= world.friction; }
    // 上に突き抜けたら終了条件チェック
    if (b.y - b.r < world.top - 8){
      triggerGameOver();
    }
  }

  // 円同士の衝突解決 & マージ
  // 1) 位置解決 + 反発（円ベース）
  for (let i=0;i<balls.length;i++){
    for (let j=i+1;j<balls.length;j++){
      resolveCircle(balls[i], balls[j]);
    }
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
          score += LEVELS[a.level].score;
          balls.splice(j,1); balls.splice(i,1);
          balls.push(nb);
          break outer;
        }
        // 5: ぶり → 6: 刺身
        if (a.level === 5){
          const nl = 6;
          const nb = { x:nx, y:ny, vx:(a.vx+b.vx)/2, vy:-6, r:LEVELS[nl].r, level:nl, id:crypto.randomUUID() };
          // 効果音（寒ブリ祭り！／煌）
          playFestivalBig();
          showBurst(Math.random()<0.5 ? '寒ブリ祭り！' : '煌', nx, ny-20, Math.random()<0.5 ? 'big' : 'kira');
          score += LEVELS[a.level].score;
          balls.splice(j,1); balls.splice(i,1);
          balls.push(nb);
          break outer;
        }
        // 6〜8: 刺身→寿司→ぶり大根→鰤しゃぶ
        if (a.level >= 6 && a.level <= 8){
          const nl = a.level + 1;
          const nb = { x:nx, y:ny, vx:(a.vx+b.vx)/2, vy:-6, r:LEVELS[nl].r, level:nl, id:crypto.randomUUID() };
          playFestivalShort();
          score += LEVELS[a.level].score;
          balls.splice(j,1); balls.splice(i,1);
          balls.push(nb);
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

  // 海中の泡っぽい粒子（軽い装飾）
  for (let i=0;i<16;i++){
    const x = world.left + ((i*137)% (world.right-world.left));
    const y = (performance.now()/30 + i*60) % (world.bottom-world.top) + world.top;
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
  document.getElementById('gameover').style.display = 'none';
  last = performance.now();
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
