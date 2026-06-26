// =============================================================
// 앱 진입점 (main.js)
// [1~4단계] 웹캠 / 손인식 / 커서·핀치 / BROWSE        ← 완료
// [B1~B5] 양손커서 / 소환 / 흩어짐 / 집기·드래그·늘리기 ← 완료
// [퍼즐]  충분히 늘리면 3×3 퍼즐 (집어서 swap)         ← 완료
// [7단계 REVEAL] 퍼즐 완성 → 그 밈 영상 중앙 재생       ← 지금
// 취소/뒤로는 ESC 키
// =============================================================

import { CONFIG } from './config.js';
import { startWebcam } from './webcam.js';
import { createHandLandmarker } from './handTracking.js';
import { GestureTracker } from './gestures.js';
import { BrowseScene } from './browse.js';
import { PuzzleScene } from './puzzle.js';
import { Application } from 'pixi.js';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';

const stageEl = document.getElementById('stage');
const videoEl = document.getElementById('webcam');
const canvasEl = document.getElementById('overlay');
const revealVideoEl = document.getElementById('reveal');
const messageEl = document.getElementById('overlay-message');
const hudStateEl = document.getElementById('hud-state');
const hudHelpEl = document.getElementById('hud-help');

const ctx = canvasEl.getContext('2d');

if (CONFIG.webcam.mirror) {
  videoEl.classList.add('mirror');
  canvasEl.classList.add('mirror');
}

// ----- 양손 추적 -----
const HAND_LABELS = ['Left', 'Right'];
const trackers = { Left: new GestureTracker(), Right: new GestureTracker() };
const cursorEls = {};
const prevPinch = { Left: false, Right: false };
const grabHands = { Left: false, Right: false };

// ----- 앱 상태 -----
let appState = 'IDLE'; // IDLE → SUMMONED → SCATTERED → GRABBED → PUZZLE → REVEAL
let summonArmed = false;
let summonArmedTime = 0;
let puzzleHand = null;   // 퍼즐 조각을 잡은 손 라벨('Left'/'Right') — 놓을 때까지 고정
let currentMeme = null;  // 지금 퍼즐/영상으로 진행 중인 밈

let handLandmarker = null;
let drawingUtils = null;
let lastVideoTime = -1;
let latestResults = null;
let lastNow = 0;
let pixiApp = null;
let browseScene = null;
let puzzleScene = null;

function createCursor() {
  const el = document.createElement('div');
  el.className = 'cursor';
  el.style.width = CONFIG.cursor.size + 'px';
  el.style.height = CONFIG.cursor.size + 'px';
  stageEl.appendChild(el);
  return el;
}

async function init() {
  try {
    await startWebcam(videoEl);

    messageEl.textContent = '손 인식 모델을 불러오는 중...';
    messageEl.style.display = '';
    handLandmarker = await createHandLandmarker();
    drawingUtils = new DrawingUtils(ctx);
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;

    messageEl.textContent = '밈을 불러오는 중...';
    pixiApp = new Application();
    await pixiApp.init({ resizeTo: window, backgroundAlpha: 0, antialias: true });
    pixiApp.canvas.id = 'pixi';
    stageEl.appendChild(pixiApp.canvas);
    browseScene = new BrowseScene(pixiApp);
    await browseScene.load();

    for (const h of HAND_LABELS) cursorEls[h] = createCursor();

    messageEl.style.display = 'none';
    setStateLabel();
    window.addEventListener('resize', () => browseScene.layout());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') onCancel(); });
    // 영상이 끝나면 자동으로 처음(흩어진 상태)으로 복귀
    revealVideoEl.addEventListener('ended', () => { if (appState === 'REVEAL') hideReveal(); });

    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error('초기화 실패:', err);
    messageEl.style.display = '';
    messageEl.textContent = '문제가 생겼어요 😢\n(에러: ' + err.message + ')';
  }
}

function splitHandsByLabel() {
  const byHand = { Left: null, Right: null };
  if (!latestResults || !latestResults.landmarks) return byHand;
  const labels = latestResults.handednesses || latestResults.handedness || [];
  for (let i = 0; i < latestResults.landmarks.length; i++) {
    let cat = labels[i] && labels[i][0] ? labels[i][0].categoryName : null;
    if (cat !== 'Left' && cat !== 'Right') cat = byHand.Left ? 'Right' : 'Left';
    if (byHand[cat]) cat = cat === 'Left' ? 'Right' : 'Left';
    if (!byHand[cat]) byHand[cat] = latestResults.landmarks[i];
  }
  return byHand;
}

function renderLoop() {
  if (videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;
    latestResults = handLandmarker.detectForVideo(videoEl, performance.now());
  }
  const now = performance.now();
  const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 1 / 60;
  lastNow = now;
  const tSec = now / 1000;

  // (A) 손 점·선 (디버그)
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (CONFIG.hands.showLandmarks && latestResults && latestResults.landmarks) {
    for (const landmarks of latestResults.landmarks) {
      drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
        color: CONFIG.hands.lineColor, lineWidth: CONFIG.hands.lineWidth,
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: CONFIG.hands.pointColor, radius: CONFIG.hands.pointRadius,
      });
    }
  }

  // (B) 양손 제스처
  const byHand = splitHandsByLabel();
  for (const h of HAND_LABELS) trackers[h].update(byHand[h], now);
  const L = trackers.Left;
  const R = trackers.Right;
  const both = L.visible && R.visible;
  let gap = 0;
  let center = { x: 0, y: 0 };
  if (both) {
    gap = Math.hypot(L.cursor.x - R.cursor.x, L.cursor.y - R.cursor.y);
    center = { x: (L.cursor.x + R.cursor.x) / 2, y: (L.cursor.y + R.cursor.y) / 2 };
  }
  const maxSpeed = Math.max(L.visible ? L.speed : 0, R.visible ? R.speed : 0);

  // (C) 상태별 로직
  if (appState === 'PUZZLE' && puzzleScene) {
    updatePuzzle();
  } else if (appState === 'REVEAL') {
    if (puzzleScene) puzzleScene.update(); // 완성 배치 마무리(조작 없음)
  } else {
    detectGestures(both, gap, center, now);
    checkStretchToPuzzle();
    browseScene.update(dt, tSec, {
      center, gap, speed: maxSpeed, bothVisible: both, grab: buildGrabInfo(),
    });
  }

  // (D) 커서 + HUD
  for (const h of HAND_LABELS) updateCursor(h);
  updateHud(gap, both);

  // (E) 핀치 직전 상태 갱신
  for (const h of HAND_LABELS) prevPinch[h] = trackers[h].pinch;

  requestAnimationFrame(renderLoop);
}

// ----- BROWSE 단계 제스처 -----
function detectGestures(both, gap, center, now) {
  const bothPinch = trackers.Left.pinch && trackers.Right.pinch;
  const bothOpen = trackers.Left.open && trackers.Right.open;

  if (appState === 'IDLE') {
    if (both && bothPinch && gap < CONFIG.summon.closeGap) {
      summonArmed = true;
      summonArmedTime = now;
    }
    if (summonArmed) {
      if (now - summonArmedTime > CONFIG.summon.armWindow * 1000) {
        summonArmed = false;
      } else if (both && gap > CONFIG.summon.openGap) {
        summonArmed = false;
        appState = 'SUMMONED';
        browseScene.summon(center);
        setStateLabel();
      }
    }
  } else if (appState === 'SUMMONED') {
    if (bothOpen) {
      appState = 'SCATTERED';
      browseScene.scatter();
      setStateLabel();
    }
  } else if (appState === 'SCATTERED' || appState === 'GRABBED') {
    manageGrab();
  }
}

function manageGrab() {
  for (const h of HAND_LABELS) {
    const t = trackers[h];
    const pinchDown = t.visible && t.pinch && !prevPinch[h];
    const pinchUp = !t.pinch && prevPinch[h];

    if (pinchDown) {
      if (appState === 'SCATTERED') {
        const item = browseScene.pickAt(t.cursor.x, t.cursor.y);
        if (item) {
          browseScene.grab(item);
          grabHands.Left = false; grabHands.Right = false;
          grabHands[h] = true;
          appState = 'GRABBED';
          setStateLabel();
        }
      } else if (appState === 'GRABBED' && isNearGrabbed(t.cursor)) {
        grabHands[h] = true;
      }
    }
    if (pinchUp || !t.visible) grabHands[h] = false;
  }

  if (appState === 'GRABBED' && !grabHands.Left && !grabHands.Right) {
    appState = 'SCATTERED';
    browseScene.ungrab();
    setStateLabel();
  }
}

function isNearGrabbed(cur) {
  const g = browseScene.grabbed;
  if (!g) return false;
  const half = (CONFIG.browse.memeSize * g.scale) / 2 + CONFIG.stretch.grabNearPad;
  return Math.abs(cur.x - g.x) < half && Math.abs(cur.y - g.y) < half;
}

function buildGrabInfo() {
  const hands = [];
  if (appState === 'GRABBED') {
    for (const h of HAND_LABELS) if (grabHands[h] && trackers[h].visible) hands.push(trackers[h].cursor);
  }
  return { hands };
}

function checkStretchToPuzzle() {
  if (appState !== 'GRABBED') return;
  const hands = buildGrabInfo().hands;
  if (hands.length >= 2) {
    const gp = Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y);
    if (gp >= CONFIG.stretch.puzzleGap) startPuzzle();
  }
}

// ----- 퍼즐 -----
function startPuzzle() {
  currentMeme = browseScene.grabbed.meme;
  const texture = browseScene.grabbed.texture;
  browseScene.hide();
  grabHands.Left = false; grabHands.Right = false;
  puzzleHand = null;
  puzzleScene = new PuzzleScene(pixiApp, texture, onPuzzleSolved);
  appState = 'PUZZLE';
  setStateLabel();
}

// 퍼즐 조작: 한 손으로 집으면 그 손을 '고정'해서 놓을 때까지 그 손만 따라감
function updatePuzzle() {
  if (puzzleHand === null) {
    // 아직 안 잡음 → 어느 손이든 '처음 핀치'로 조각 집기 시도
    for (const h of HAND_LABELS) {
      const t = trackers[h];
      if (t.visible && t.pinch && !prevPinch[h]) {
        if (puzzleScene.tryPick(t.cursor.x, t.cursor.y)) { puzzleHand = h; break; }
      }
    }
  } else {
    // 잡은 손만 추적: 핀치 풀거나 손 사라지면 놓기, 아니면 드래그
    const t = trackers[puzzleHand];
    if (!t.visible || !t.pinch) {
      puzzleScene.drop();
      puzzleHand = null;
    } else {
      puzzleScene.moveHeld(t.cursor.x, t.cursor.y);
    }
  }
  puzzleScene.update();
}

function quitPuzzle() {
  if (puzzleScene) { puzzleScene.destroy(); puzzleScene = null; }
  puzzleHand = null;
  browseScene.scatter();
  appState = 'SCATTERED';
  setStateLabel();
}

function onPuzzleSolved() {
  appState = 'REVEAL';
  setStateLabel();
  // 완성된 그림을 잠깐 보여준 뒤, 같은 밈 영상이 그 위로 자연스럽게 이어 재생
  setTimeout(() => { if (appState === 'REVEAL') showReveal(); }, CONFIG.reveal.startDelayMs);
}

// ----- 7단계 REVEAL -----
function showReveal() {
  if (!currentMeme) return;
  const v = revealVideoEl;
  v.style.width = CONFIG.puzzle.boardSize + 'px';
  v.style.height = CONFIG.puzzle.boardSize + 'px';
  v.src = currentMeme.video;
  v.currentTime = 0;
  v.loop = false;
  v.style.display = 'block';
  // 다음 프레임에 opacity 를 올려야 CSS 페이드가 작동
  requestAnimationFrame(() => { v.style.opacity = '1'; });
  v.play().catch((e) =>
    console.warn('영상 재생 실패 (아직 플레이스홀더 mp4 가 없을 수 있어요):', e)
  );
}

function hideReveal() {
  const v = revealVideoEl;
  v.pause();
  v.style.opacity = '0';
  setTimeout(() => { v.style.display = 'none'; v.removeAttribute('src'); v.load(); }, CONFIG.reveal.fadeMs);
  if (puzzleScene) { puzzleScene.destroy(); puzzleScene = null; }
  puzzleHand = null;
  browseScene.scatter();
  appState = 'SCATTERED';
  setStateLabel();
}

// ----- 커서 / HUD -----
function updateCursor(h) {
  const t = trackers[h];
  const el = cursorEls[h];
  if (!t.visible) { el.style.opacity = '0'; return; }
  el.style.opacity = '1';
  const s = CONFIG.cursor.size;
  const scale = t.pinch ? 0.72 : 1;
  el.style.transform =
    `translate(${t.cursor.x - s / 2}px, ${t.cursor.y - s / 2}px) scale(${scale})`;
  el.style.background = t.pinch ? CONFIG.cursor.pinchColor : CONFIG.cursor.color;
}

function setStateLabel() {
  const labels = {
    IDLE: 'B2 · 양손 꼬집어 모았다 벌리면 소환 ✨',
    SUMMONED: 'B2 · 소환됨! 양손 쫙 펴면 흩어져요',
    SCATTERED: 'B3 · 흩어짐 · 밈을 핀치로 집어보세요',
    GRABBED: 'B5 · 집음! 다른 손으로 같이 잡고 벌리면 퍼즐',
    PUZZLE: '퍼즐 · 조각을 집어 다른 칸과 바꿔 맞춰요 🧩',
    REVEAL: '완성! 🎉 영상 재생 중 · (ESC 로 처음)',
  };
  hudStateEl.textContent = labels[appState];
}

function updateHud(gap, both) {
  if (appState === 'SUMMONED') {
    hudHelpEl.textContent = '↔ 양손 간격으로 원 크기 조절 · 손 쫙 펴면 흩어짐 · (ESC 리셋)';
    return;
  }
  if (appState === 'SCATTERED') {
    hudHelpEl.textContent = '🤏 밈 위에서 핀치로 집기 · (ESC 리셋)';
    return;
  }
  if (appState === 'GRABBED') {
    const n = (grabHands.Left ? 1 : 0) + (grabHands.Right ? 1 : 0);
    if (n >= 2) {
      const hands = buildGrabInfo().hands;
      const gp = hands.length >= 2 ? Math.round(Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y)) : 0;
      hudHelpEl.textContent = `양손으로 잡음 · 더 벌리면 퍼즐! (${gp} / ${CONFIG.stretch.puzzleGap})`;
    } else {
      hudHelpEl.textContent = '끌어서 이동 · 다른 손으로 같이 잡고 벌리면 퍼즐 · (손 놓으면 취소)';
    }
    return;
  }
  if (appState === 'PUZZLE') {
    hudHelpEl.textContent = '🧩 조각을 핀치로 집어 원하는 칸에서 핀치 풀면 자리 바뀜 · (ESC 포기)';
    return;
  }
  if (appState === 'REVEAL') {
    hudHelpEl.textContent = '퍼즐 완성! 영상이 끝나면 자동으로 돌아가요 🎬 · (ESC 처음)';
    return;
  }
  // IDLE
  const icons = HAND_LABELS.map((h) => {
    const t = trackers[h];
    if (!t.visible) return null;
    return t.pinch ? '🤏' : t.open ? '🖐️' : '✋';
  }).filter(Boolean);
  let txt = icons.length ? `손: ${icons.join('  ')}` : '양손을 화면에 보여보세요';
  if (both) txt += `   ↔ ${Math.round(gap)}px`;
  if (summonArmed) txt += '   🔒 장전! 벌리면 소환';
  hudHelpEl.textContent = txt;
}

// ESC = 상태에 따라 한 단계 뒤로
function onCancel() {
  if (appState === 'REVEAL') {
    hideReveal();
  } else if (appState === 'PUZZLE') {
    quitPuzzle();
  } else if (appState === 'GRABBED') {
    grabHands.Left = false; grabHands.Right = false;
    browseScene.ungrab();
    appState = 'SCATTERED';
    setStateLabel();
  } else if (appState === 'SUMMONED' || appState === 'SCATTERED') {
    appState = 'IDLE';
    summonArmed = false;
    browseScene.hide();
    setStateLabel();
  }
}

init();
