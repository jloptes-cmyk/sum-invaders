// SUM INVADERS — MVP (Paso 34)
// Flow:
// INSERT COIN -> START
// -> LEVEL CARD (Level 1: 1–20) -> COUNTDOWN
// -> GAME: número cae 10 pisos (piso a piso). Si toca suelo => GAME OVER.
// + 6 vidas: cada error resta 1. (Si llega a 0 => GAME OVER)

document.addEventListener("DOMContentLoaded", () => {
  const startScreen = document.getElementById("start-screen");
  const gameScreen  = document.getElementById("game-screen");

  const insertCoin  = document.getElementById("insert-coin");
  const startBtn    = document.getElementById("start-btn");

  const countdownEl = document.getElementById("countdown");
  const gameUi      = document.getElementById("game-ui");

  const wellEl      = document.querySelector(".well");
  const groundEl    = wellEl ? wellEl.querySelector(".ground") : null;
  const targetEl    = document.getElementById("target");
  const optionBtns  = Array.from(document.querySelectorAll(".options .opt-btn"));

  // ===== HUD helpers (robusto) =====
  function getHudValueByLabel(label){
    const blocks = Array.from(document.querySelectorAll(".hud .hud-block"));
    for (const b of blocks){
      const lab = b.querySelector(".hud-label");
      const val = b.querySelector(".hud-value");
      if (!lab || !val) continue;
      if (lab.textContent.trim().toUpperCase() === label.toUpperCase()) return val;
    }
    return null;
  }

  const scoreEl = getHudValueByLabel("SCORE");
  const lvEl    = getHudValueByLabel("LV");
  const tmrEl   = (() => {
    const v = getHudValueByLabel("TMR");
    if (v) v.id = "tmr";
    return v;
  })();
  const errEl   = (() => {
    const v = getHudValueByLabel("ERR");
    if (v) v.classList.add("err-bars");
    return v;
  })();


  // Quitar SPD del HUD (no lo usamos)
  (function removeSpdHud(){
    const blocks = Array.from(document.querySelectorAll(".hud .hud-block"));
    for (const b of blocks){
      const lab = b.querySelector(".hud-label");
      if (!lab) continue;
      if (lab.textContent.trim().toUpperCase() === "SPD"){
        b.remove();
      }
    }
  })();

  // --- Diagnóstico mínimo ---
  const missing = [];
  if (!startScreen) missing.push("#start-screen");
  if (!gameScreen)  missing.push("#game-screen");
  if (!insertCoin)  missing.push("#insert-coin");
  if (!startBtn)    missing.push("#start-btn");
  if (!countdownEl) missing.push("#countdown");
  if (!gameUi)      missing.push("#game-ui");
  if (!wellEl)      missing.push(".well");
  if (!groundEl)    missing.push(".well .ground");
  if (!targetEl)    missing.push("#target");
  if (optionBtns.length === 0) missing.push(".options .opt-btn (botones)");

  if (missing.length) {
    console.error("[BOOT] Faltan elementos en el DOM:", missing.join(", "));
    return;
  }

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function runCountdown(){
    // No dar pistas: ocultamos UI del juego
    gameUi.classList.add("game-hidden");
    countdownEl.classList.remove("hidden");

    countdownEl.textContent = "3"; await sleep(1000);
    countdownEl.textContent = "2"; await sleep(1000);
    countdownEl.textContent = "1"; await sleep(1000);
    countdownEl.textContent = "START!"; await sleep(1000);

    countdownEl.classList.add("hidden");
    gameUi.classList.remove("game-hidden");
  }

    // =========================
  // SFX (simple, light, non-annoying)
  // Uses Web Audio API (no external files)
  // iOS note: audio starts only after a user gesture (we init on first click)
  // =========================
  let audioEnabled = true;
  let audioCtx = null;
  let masterGain = null;

  function initAudio(){
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    // global volume (keep low)
    masterGain.gain.value = 0.28;
    masterGain.connect(audioCtx.destination);
  }

  async function resumeAudio(){
    if (!audioCtx) return;
    if (audioCtx.state === "suspended"){
      try{ await audioCtx.resume(); }catch(e){}
    }
  }

  function playBeep({from=440, to=null, dur=0.10, type="sine", vol=0.10}){
    if (!audioCtx || !masterGain) return;
    const t0 = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null){
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    }

    // envelope: quick attack, quick decay
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playClick(vol=0.06, dur=0.03){
    if (!audioCtx || !masterGain) return;
    const t0 = audioCtx.currentTime;

    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++){
      // tiny decaying noise
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.buffer = buffer;
    src.connect(gain);
    gain.connect(masterGain);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
  }

  function playSfx(name){
    if (!audioEnabled) return;
    initAudio();
    // Best-effort resume (some browsers require this inside a gesture handler)
    resumeAudio();

    const n = String(name || "").toLowerCase();

    // Helper: short 8-bit beep (square) with envelope
    const beep = (from, to=null, dur=0.09, vol=0.55) =>
      playBeep({ from, to, dur, type: "square", vol });

    // Helper: tiny click to add "arcade hardware" feel
    const click = (vol=0.10, dur=0.018) => playClick(vol, dur);

    switch(n){
      case "coin": {
        // Classic double-beep + light click
        click(0.14, 0.014);
        beep(220, 440, 0.08, 0.60);
        setTimeout(() => beep(440, 660, 0.07, 0.55), 90);
        break;
      }
      case "start": {
        // Quick rising arpeggio
        beep(440, 660, 0.07, 0.50);
        setTimeout(() => beep(660, 880, 0.07, 0.50), 80);
        setTimeout(() => beep(880, 1320, 0.06, 0.45), 160);
        break;
      }
      case "ok":
      case "correct": {
        // Bright satisfying ping (short, not obnoxious)
        beep(880, 1320, 0.06, 0.50);
        setTimeout(() => beep(1320, null, 0.05, 0.42), 70);
        break;
      }
      case "bad":
      case "wrong": {
        // Short low "bzz"
        click(0.12, 0.018);
        beep(220, 140, 0.10, 0.45);
        break;
      }
      case "hit":
      case "gameover": {
        // Classic GAME OVER fall (descending, longer)
        click(0.16, 0.020);
        beep(392, 196, 0.22, 0.55);  // G4 -> G3
        setTimeout(() => beep(196, 98, 0.26, 0.55), 220); // G3 -> G2
        break;
      }
      case "retry":
      case "tryagain": {
        // Happy retry jingle (short, upbeat)
        click(0.14, 0.016);
        beep(523, null, 0.06, 0.55); // C5
        setTimeout(() => beep(659, null, 0.06, 0.55), 80); // E5
        setTimeout(() => beep(784, null, 0.07, 0.55), 160); // G5
        break;
      }

      default:
        break;
    }
  }

  // =========================
  // LEVELS (por ahora solo Level 1)
  // =========================
  const CORRECTS_TO_LEVEL_UP = 1;

// Niveles infinitos (rango por centenas):
// Level 1: 0–100, Level 2: 100–200, Level 3: 200–300, ...
function levelRange(i){
  const min = i * 100;
  const max = (i + 1) * 100;
  return { name: `LEVEL ${i + 1}`, min, max };
}

let levelIndex = 0;
  let correctInLevel = 0;
  // ancho fijo de dígitos para las sumas (para que todas se vean XXX + XXX, etc.)
  // Level overlay (sin tocar HTML)
  let levelEl = document.getElementById("levelcard");
  if (!levelEl && gameScreen){
    levelEl = document.createElement("div");
    levelEl.id = "levelcard";
    levelEl.innerHTML = `
      <div class="lv-box">
        <p class="lv-title">LEVEL 1</p>
      </div>
    `;
    gameScreen.appendChild(levelEl);
  }

  async function showLevelOverlay(i){
    const L = levelRange(i);
    if (!levelEl) return;

    // Ocultar TODO el fondo del juego durante el aviso de nivel
    gameUi.classList.add("game-hidden");

    // Pausar todo
    stopStepTimer();
    turnActive = false;
    optionBtns.forEach(b => { b.disabled = true; b.classList.add("locked"); });

    const title = levelEl.querySelector(".lv-title");
    const sub   = levelEl.querySelector(".lv-sub");
    if (title) title.textContent = L.name;
    if (sub)   sub.textContent = `${L.min} – ${L.max}`;

    levelEl.classList.add("active");
    await sleep(1200);
    levelEl.classList.remove("active");
  }

  function currentLevel(){
    return levelRange(levelIndex);
  }

  // =========================
  // GAME OVER overlay
  // =========================
  let gameOverEl = document.getElementById("gameover");
  if (!gameOverEl && gameScreen){
    gameOverEl = document.createElement("div");
    gameOverEl.id = "gameover";
    gameOverEl.innerHTML = `
      <div class="go-box">
        <p class="go-title">GAME OVER</p>
        <p class="go-sub blink">PRESS ENTER / START</p>
      </div>
    `;
    gameScreen.appendChild(gameOverEl);

// =========================
// CORRECT overlay (mensaje de acierto)
// =========================
let correctEl = document.getElementById("correctmsg");
if (!correctEl && gameScreen){
  correctEl = document.createElement("div");
  correctEl.id = "correctmsg";
  correctEl.innerHTML = `
    <div class="ok-box">
      <p class="ok-title">CORRECT!</p>
    </div>
  `;
  gameScreen.appendChild(correctEl);
}

function showCorrectMsg(ms = 2000){
  return new Promise(res => {
    if (!correctEl){ res(); return; }
    correctEl.classList.add("active");
    setTimeout(() => {
      correctEl.classList.remove("active");
      res();
    }, ms);
  });
}

  }


  function hideGameOver(){
    if (gameOverEl) gameOverEl.classList.remove("active");
  }

  

// =========================
// VICTORY overlay (final)
// =========================
let victoryEl = document.getElementById("victory");
if (!victoryEl && gameScreen){
  victoryEl = document.createElement("div");
  
victoryEl.id = "victory";
  victoryEl.innerHTML = `
    <div class="end-box">
      <p class="end-title" id="end-title">CONGRATULATIONS!</p>
      <p class="end-sub" id="end-sub">YOU CLEARED ALL LEVELS</p>

      <div class="end-stats" id="end-stats"></div>

      <button class="end-retry" id="end-retry">TRY AGAIN?</button>
    </div>
  `;
  gameScreen.appendChild(victoryEl);
}

function hideVictory(){
  if (victoryEl) victoryEl.classList.remove("active");
}

function formatSec(s){
  if (!isFinite(s)) return "0.0 s";
  return s.toFixed(1) + " s";
}

function formatTotal(sec){
  const s = (isFinite(sec) ? Math.max(0, sec) : 0);
  const mins = Math.floor(s / 60);
  const rem  = s - (mins * 60);

  const line1 = s.toFixed(1) + " s";
  const line2 = `${mins}m ${rem.toFixed(1)}s`;

  // Dos filas: primero segundos, debajo minutos
  return `${line1}<br>${line2}`;
}

function getRunStats(){
  const turns = responseTimesMs.length; // solo aciertos

  const avgMs = turns ? (responseTimesMs.reduce((a,b)=>a+b,0)/turns) : 0;
  const bestMs = turns ? Math.min(...responseTimesMs) : 0;
  const totalTimeMs = runStartMs ? (performance.now() - runStartMs) : 0;

  return {
    score,
    levelReached: levelIndex + 1,
    errors,
    maxErrors: MAX_ERRORS,
    turns,
    avgRespSec: avgMs/1000,
    bestRespSec: bestMs/1000,
    totalTimeSec: totalTimeMs/1000,
  };
}

function showEndScreen(mode){
  // mode: "victory" | "gameover"
  stopStepTimer();
  turnActive = false;
  optionBtns.forEach(b => { b.disabled = true; b.classList.add("locked"); });

  const titleEl = document.getElementById("end-title");
  const subEl   = document.getElementById("end-sub");

  if (mode === "victory"){
    if (titleEl) titleEl.textContent = "CONGRATULATIONS!";
    if (subEl) subEl.textContent = "YOU CLEARED ALL LEVELS";
  } else {
    if (titleEl) titleEl.textContent = "GAME OVER";
    if (subEl) subEl.textContent = "THE NUMBER TOUCHED THE BASE";
  }

  // blink title a couple times
  if (titleEl){
    titleEl.classList.add("blink-victory");
    setTimeout(() => titleEl.classList.remove("blink-victory"), 1200);
  }

  const stats = getRunStats();

  const statsEl = document.getElementById("end-stats");
  if (statsEl){
    // Two-column grid label/value
    statsEl.innerHTML = `
      <div class="row"><span class="k">SCORE</span><span class="v">${String(stats.score).padStart(6,"0")}</span></div>
      <div class="row"><span class="k">LEVELS</span><span class="v">${stats.levelReached}</span></div>
      <div class="row"><span class="k">AVG / TURN</span><span class="v">${formatSec(stats.avgRespSec)}</span></div>
      <div class="row"><span class="k">BEST / TURN</span><span class="v">${formatSec(stats.bestRespSec)}</span></div>
      <div class="row"><span class="k">TOTAL&nbsp;TIME</span><span class="v">${formatTotal(stats.totalTimeSec)}</span></div>
`;
  }

  const retryBtn = document.getElementById("end-retry");
  if (retryBtn){
    retryBtn.onclick = async () => {
      hideVictory();
      hideGameOver();
      await startRun();
    };
  }

  if (victoryEl){
    victoryEl.classList.add("active");
  }
}


// =========================
  // GAME STATE
  // =========================
  const MAX_ERRORS = 6;
  const MAX_STEPS  = 10;

  let coinInserted = false;
  let turnActive = false;

  let score = 0;
  let errors = 0;

  // Métricas para resultados compartibles
  let runStartMs = 0;
  let turnStartMs = 0;
  const responseTimesMs = [];

  let stepsLeft = MAX_STEPS;
  let stepTimer = null;
  let invaderStepIndex = 0; // 0..MAX_STEPS (cuántos pisos ha bajado en este turno)

  // ===== HUD render =====
  function renderScore(){
    if (!scoreEl) return;
    scoreEl.textContent = String(score).padStart(6, "0");
  }

  function renderErr(){
    if (!errEl) return;
    let out = "";
    for (let i = 0; i < MAX_ERRORS; i++){
      out += (i < errors)
        ? `<span class="err-on">|</span>`
        : `<span class="err-off">|</span>`;
    }
    errEl.innerHTML = out;
  }

  function renderLevel(){
    if (!lvEl) return;
    lvEl.textContent = String(levelIndex + 1);
  }

  function renderTimer(){
    if (!tmrEl) return;
    const on  = "|".repeat(Math.max(0, stepsLeft));
    const off = ".".repeat(Math.max(0, MAX_STEPS - stepsLeft));
    tmrEl.textContent = on + off;
  }

  // =========================
  // TARGET FALL (10 pisos, sin deslizar)
  // Reglas:
  // - Empieza 1 "piso" más arriba (más aire arriba)
  // - En el piso 10 toca justo el suelo
  // - Si llega al piso 10 => GAME OVER
  // =========================
  function getGroundTouchTop(){
  // Y dentro del .well donde el número debe “tocar” la línea (encima de la base)
  const groundRect = groundEl.getBoundingClientRect();
  const wellRect = wellEl.getBoundingClientRect();
  const numH = targetEl.getBoundingClientRect().height || targetEl.offsetHeight || 0;

  // Top relativo al .well
  const groundTopRel = groundRect.top - wellRect.top;

  // Queremos que la parte inferior del número quede justo en la línea
  // => top = groundTopRel - alturaNumero
  return Math.max(0, groundTopRel - numH);
}

function getStepTopPx(stepIndex){
  // stepIndex: 0..MAX_STEPS
  // Start 1 piso más arriba (más aire arriba)
  const startTop = 28; // ajustado (antes 44)
  const endTop   = getGroundTouchTop(); // tocar base

  const travel = Math.max(0, endTop - startTop);
  const perStep = (MAX_STEPS === 0) ? 0 : (travel / MAX_STEPS);

  return startTop + (perStep * stepIndex);
}


  function placeTargetAtStep(stepIndex){
    // Piso a piso: SIN transición top
    targetEl.style.top = getStepTopPx(stepIndex) + "px";
  }

  function prepareNewTurnTarget(){
    targetEl.classList.remove("hit","success");
    targetEl.style.opacity = "1";
    placeTargetAtStep(0);
  }

  function updateTargetFall(){
    const stepIndex = Math.max(0, Math.min(MAX_STEPS, (MAX_STEPS - stepsLeft)));
    invaderStepIndex = stepIndex;
    placeTargetAtStep(stepIndex);
  }

  function setTarget(n){
    targetEl.textContent = String(n);
  }

  // =========================
  // OPTIONS
  // =========================
  function formatSum(a,b){ return `${a} + ${b}`; }


  function buildOptions(target, count){
  const opts = [];

  // Reglas:
  // - Mismo nº de cifras por opción (según target, ajustado si no es viable)
  // - Sin ceros a la izquierda (dígito inicial nunca 0)
  // - Ningún número puede terminar en 0 (ni target ni addendos)
  // - Generamos falsas "cerca" del target para que no canten

  const endsWithZero = (n) => (Math.abs(n) % 10) === 0;

  // Elegimos ancho basado en el target, pero si el target es demasiado pequeño
  // para tener 2 addendos con esas cifras, bajamos el ancho.
  let d = String(Math.abs(target)).length;
  while (d > 1){
    const minAddD = Math.pow(10, d - 1); // 100, 10, ...
    if (target >= 2 * minAddD) break;    // posible: a>=minAdd y b>=minAdd
    d -= 1;
  }

  // Para 1 dígito: evitamos el 0 (porque termina en 0)
  const minAdd = (d === 1) ? 1 : Math.pow(10, d - 1);
  const maxAdd = Math.pow(10, d) - 1;

  function tryPickCorrect(){
    const aMin = minAdd;
    const aMax = Math.min(maxAdd, target - minAdd);
    if (aMax < aMin) return null;

    // Intentos para cumplir "no termina en 0" en ambos
    for (let k = 0; k < 300; k++){
      const a = Math.floor(Math.random() * (aMax - aMin + 1)) + aMin;
      const b = target - a;
      if (b < minAdd || b > maxAdd) continue;
      if (endsWithZero(a) || endsWithZero(b)) continue;
      return { a, b };
    }
    return null;
  }

  function tryPickFallback(){
    // Para targets muy pequeños, bajamos a 1 dígito "limpio"
    // pero seguimos evitando que termine en 0.
    for (let k = 0; k < 200; k++){
      const aa = Math.floor(Math.random() * 9) + 1; // 1..9
      const bb = target - aa;
      if (bb < 1 || bb > 9) continue;
      if (endsWithZero(aa) || endsWithZero(bb)) continue;
      return { a: aa, b: bb };
    }
    // Último recurso (matemáticamente raro), pero no debería ocurrir si evitamos targets < 2
    return { a: 1, b: Math.max(1, target - 1) };
  }

  const corr = tryPickCorrect() || tryPickFallback();
  opts.push({ isCorrect: true, text: formatSum(corr.a, corr.b) });

  const used = new Set([opts[0].text]);

  // Falsas
  while (opts.length < count){
    // addendo A sin terminar en 0
    let fa = null;
    for (let k = 0; k < 80; k++){
      const cand = Math.floor(Math.random() * (maxAdd - minAdd + 1)) + minAdd;
      if (!endsWithZero(cand)) { fa = cand; break; }
    }
    if (fa === null) continue;

    // delta pequeño para que parezca plausible, sin ser correcta
    const delta = (Math.floor(Math.random() * 41) - 20) || 7; // [-20..20] nunca 0
    const fb = (target - fa) + delta;

    if (fb < minAdd || fb > maxAdd) continue;
    if (fa + fb === target) continue;
    if (endsWithZero(fa) || endsWithZero(fb)) continue;

    const t = formatSum(fa, fb);
    if (used.has(t)) continue;

    used.add(t);
    opts.push({ isCorrect: false, text: t });
  }

  // Mezclar
  for (let i = opts.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }

  return opts;
}

  function renderOptions(options){
    optionBtns.forEach((btn, idx) => {
      const opt = options[idx];

      btn.classList.remove("correct","wrong","locked");
      btn.dataset.used = "0";
      btn.disabled = false;

      if (!opt){
        btn.style.display = "none";
        btn.onclick = null;
        return;
      }

      btn.style.display = "";
      btn.textContent = opt.text;
      btn.dataset.correct = opt.isCorrect ? "1" : "0";

      btn.onclick = () => onPickOption(btn);
    });
  }

  function onPickOption(btn){
    if (!turnActive) return;
    if (btn.dataset.used === "1") return;

    btn.dataset.used = "1";
    const isCorrect = btn.dataset.correct === "1";

    if (isCorrect){
      // ✅ ACIERTO
      stopStepTimer();
      playSfx("ok");

      const respMs = Math.max(0, performance.now() - turnStartMs);
responseTimesMs.push(respMs);

// Puntuación nueva:
// Cada pantalla (turno) vale 10 puntos.
// Se resta 1 punto por cada segundo/escalón que ha bajado el número.
// (Los puntos se van acumulando en toda la partida.)
const stepsUsed = Math.min(MAX_STEPS, Math.max(0, invaderStepIndex));
const gained = Math.max(0, 10 - stepsUsed);
score += gained;
renderScore();

      correctInLevel += 1;
      // Subir de nivel cada X aciertos
      const shouldLevelUp = (correctInLevel >= CORRECTS_TO_LEVEL_UP);

      btn.classList.add("correct");

      // Fin de turno
      turnActive = false;
      optionBtns.forEach(b => { b.disabled = true; b.classList.add("locked"); });

      // Disolver y siguiente turno
      targetEl.classList.add("success");
      targetEl.style.opacity = "0";

setTimeout(async () => {
        // Mensaje de acierto (siempre)
        await showCorrectMsg(2000);

        if (shouldLevelUp){
          levelIndex += 1;
          sumWidth = String(levelRange(levelIndex).max).length;
          correctInLevel = 0;
          renderLevel();

          // Presentación del siguiente nivel + countdown
          await showLevelOverlay(levelIndex);
          await runCountdown();
        }

        nextTurn();
      }, 550);


    } else {
      // ❌ ERROR
      playSfx("bad");

      errors += 1;
      renderErr();
      if (errors >= MAX_ERRORS) { playSfx("hit"); showGameOver(score, levelIndex + 1); return; }

      btn.classList.add("wrong","locked");
      btn.disabled = true;

      // El turno sigue activo
    }
  }

  // =========================
  // TIMER (10 pisos) — 1 piso por segundo (10s)
  // - Si llega a 0 => toca suelo => GAME OVER
  // =========================
  function stopStepTimer(){
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = null;
  }

  function startStepTimer(){
    stopStepTimer();
    stepsLeft = MAX_STEPS;
    renderTimer();
    updateTargetFall(); // step 0

    stepTimer = setInterval(() => {
      if (!turnActive){
        stopStepTimer();
        return;
      }

      stepsLeft -= 1;
      renderTimer();
      updateTargetFall();

      if (stepsLeft <= 0){
        stopStepTimer();
        // Llegó al suelo => STOP + parpadeo + GAME OVER
        turnActive = false;
        optionBtns.forEach(b => { b.disabled = true; b.classList.add("locked"); });

        targetEl.classList.add("hit");
        playSfx("hit");

        // parpadeo 1.2s
        targetEl.classList.add("blink-hit");
        setTimeout(() => {
          targetEl.classList.remove("blink-hit");
          showGameOver(score, levelIndex + 1);
        }, 1200);
      }
    }, 1000);
  }

  // =========================
  // RUN
  // =========================
  function resetGame(){
    score = 0;
    levelIndex = 0;
    errors = 0;
    levelIndex = 0;
    correctInLevel = 0;

    sumWidth = String(levelRange(levelIndex).max).length;

    runStartMs = performance.now();
    responseTimesMs.length = 0;
    turnStartMs = 0;
    invaderStepIndex = 0;

    renderScore();
    renderErr();
    renderLevel();


    hideGameOver();
    hideVictory();
    stopStepTimer();
    turnActive = false;
  }

  function nextTurn(){
    if (gameOverEl && gameOverEl.classList.contains("active")) return;

    turnActive = true;

    // Nuevo target (Level 1: 1–20)
    const L = currentLevel();
    let target;
    do {
      target = Math.floor(Math.random() * (L.max - L.min + 1)) + L.min;
    } while (target < 2 || (Math.abs(target) % 10) === 0);
    setTarget(target);

    // Resetea caída
    prepareNewTurnTarget();

    // Opciones
    const options = buildOptions(target, Math.min(4, optionBtns.length));
    renderOptions(options);

    // Métrica: empieza el tiempo de respuesta del turno (solo contará si aciertas)
    turnStartMs = performance.now();

    // Timer
    startStepTimer();
  }

  async function startRun(){
    resetGame();
    await showLevelOverlay(levelIndex);
    await runCountdown();
    nextTurn();
  }

  // =========================
  // UI FLOW
  // =========================
  function showScreen(screenEl) {
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
    screenEl.classList.add("active");
  }

  function enableStart() {
    startBtn.classList.remove("disabled");
    startBtn.classList.add("ready");
  }

  function disableStart() {
    startBtn.classList.add("disabled");
    startBtn.classList.remove("ready");
  }

  // Estado inicial
  disableStart();

  insertCoin.addEventListener("click", () => {
    if (coinInserted) return;
    coinInserted = true;

    playSfx("coin");
    insertCoin.style.display = "none";
    enableStart();
  });

  startBtn.addEventListener("click", async () => {
    if (!coinInserted) return;

    playSfx("start");
    showScreen(gameScreen);

    await startRun();
  });

  // Enter: Start / Restart
  window.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;

    // Si estamos en GAME OVER, reinicia
    if ((gameOverEl && gameOverEl.classList.contains("active")) || (victoryEl && victoryEl.classList.contains("active"))){
      playSfx("retry");
      playSfx("retry");
      hideVictory();
      await startRun();
      return;
    }

    // Start screen
    if (!startScreen.classList.contains("active")) return;

    if (!coinInserted) insertCoin.click();
    else startBtn.click();
  });


  // Seguridad: al cargar, forzamos START screen y ocultamos overlays
  try{ hideVictory(); }catch(e){}
  try{ hideGameOver(); }catch(e){}
  showScreen(startScreen);
  console.log("[BOOT] OK");
});

async function submitScore(name, score, levels) {
  const url = window.SCORES_API_URL;
  if (!url) throw new Error("SCORES_API_URL missing (config.js not loaded)");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script va mejor así
    body: JSON.stringify({ name, score, levels })
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Submit failed");
  return data;
}

async function loadTopScores() {
  const url = window.SCORES_API_URL;
  if (!url) throw new Error("SCORES_API_URL missing");

  const res = await fetch(url); // GET
  const data = await res.json();
  if (!data.ok) throw new Error("Failed to load scores");
  return data.top || [];
}

async function showGameOver(score, levels) {
  // Actualiza texto de score final
  const finalScoreEl = document.getElementById("final-score");
  if (finalScoreEl) finalScoreEl.textContent = String(score);

  // Cambia a pantalla GAME OVER
  document.getElementById("start-screen")?.classList.remove("active");
  document.getElementById("game-screen")?.classList.remove("active");
  document.getElementById("gameover-screen")?.classList.add("active");

  // Helpers UI
  const nameInput = document.getElementById("player-name");
  const submitBtn = document.getElementById("submit-score-btn");
  const rankingList = document.getElementById("ranking-list");
  const restartBtn = document.getElementById("restart-btn");

  if (nameInput) nameInput.value = "";

  // Cargar ranking
  async function refreshRanking() {
    try {
      const top = await loadTopScores();
      if (!rankingList) return;
      rankingList.innerHTML = top
        .map((r) => `
          <li>
            <span class="rk-name">${escapeHtml(r.name)}</span>
            <span class="rk-score">${r.score}</span>
            <span class="rk-lv">${r.levels}</span>
          </li>
        `)
        .join("");
    } catch (e) {
      if (rankingList) rankingList.innerHTML = `<li>Could not load ranking</li>`;
      console.error(e);
    }
  }

  // Guardar score
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const name = (nameInput?.value || "").trim();
      if (!name) {
        alert("Please enter your name");
        return;
      }
      submitBtn.disabled = true;
      try {
        await submitScore(name, score, levels);
        await refreshRanking();
        if (nameInput) nameInput.value = "";
      } catch (e) {
        alert("Could not save score");
        console.error(e);
      } finally {
        submitBtn.disabled = false;
      }
    };
  }

  // Restart
  if (restartBtn) {
    restartBtn.onclick = () => {
      document.getElementById("gameover-screen")?.classList.remove("active");
      document.getElementById("start-screen")?.classList.add("active");
    };
  }

  // Primera carga del ranking
  await refreshRanking();
}

// Pequeña función para evitar inyección HTML en nombres
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}