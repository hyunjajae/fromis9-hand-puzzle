// =============================================================
// 앱 진입점 (main.js)
// [1~4단계] 웹캠 / 손인식 / 커서·핀치 / BROWSE        ← 완료
// [B1~B5] 양손커서 / 소환 / 흩어짐 / 집기·드래그·늘리기 ← 완료
// [퍼즐]  충분히 늘리면 3×3 퍼즐 (집어서 swap)         ← 완료
// [7단계 REVEAL] 퍼즐 완성 → 그 밈 영상 중앙 재생       ← 지금
// 취소/뒤로는 ESC 키
// =============================================================

import { CONFIG, gestureScale, visualScale } from './config.js';
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
let puzzleReleaseAt = 0; // 퍼즐: 잡은 손 핀치가 풀리기 시작한 시각(0=안풀림) — 깜빡임 유예용
let grabHand = null;     // 밈 집기: 집은 주 손 라벨 — 놓을 때까지 고정(다른 밈으로 안 바뀜)
let grabReleaseAt = 0;   // 밈 집기: 주 손 핀치가 풀리기 시작한 시각(0=안풀림) — 깜빡임 유예용
let currentMeme = null;  // 지금 퍼즐/영상으로 진행 중인 밈

let handLandmarker = null;
let drawingUtils = null;
let lastVideoTime = -1;
let latestResults = null;
let lastNow = 0;
let pixiApp = null;
let browseScene = null;
let puzzleScene = null;

// 7단계 REVEAL: 밈마다 영상 <video> 를 미리 만들어 받아두고 음소거로 예열해 둠.
// (재생 직전에 src 를 거는 방식은 그때부터 다운로드/디코딩하느라 늦게 켜지고 끊겨요.)
const revealVideos = {}; // meme.id → <video>
let activeReveal = null;  // 지금 재생 중인 영상

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
    buildRevealVideos(); // 영상들을 미리 받아두고 음소거로 예열(즉시 재생 준비)

    for (const h of HAND_LABELS) cursorEls[h] = createCursor();

    messageEl.style.display = 'none';
    setStateLabel();
    window.addEventListener('resize', () => browseScene.layout());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') onCancel(); });

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
  // 영상 재생 중에는 무거운 손 인식을 멈춰서 영상이 끊기지 않게 한다.
  // (퍼즐 그림은 Pixi 가 알아서 계속 그려주고, ESC/영상끝 처리는 별도 이벤트로 동작)
  if (appState === 'REVEAL') {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    for (const h of HAND_LABELS) cursorEls[h].style.opacity = '0';
    if (puzzleScene) puzzleScene.update();
    requestAnimationFrame(renderLoop);
    return;
  }

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
    updatePuzzle(now);
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
  // 화면이 작으면(모바일) 양손 간격 기준값들을 같은 비율로 줄여서 손이 끝까지 닿게 함
  const gs = gestureScale();

  if (appState === 'IDLE') {
    if (both && bothPinch && gap < CONFIG.summon.closeGap * gs) {
      summonArmed = true;
      summonArmedTime = now;
    }
    if (summonArmed) {
      if (now - summonArmedTime > CONFIG.summon.armWindow * 1000) {
        summonArmed = false;
      } else if (both && gap > CONFIG.summon.openGap * gs) {
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
    manageGrab(now);
  }
}

// 밈 집기/끌기: 한 번 집으면 그 손(grabHand)에 '고정'.
// 집은 동안에는 pickAt 을 다시 부르지 않으므로, 다른 밈 위를 지나가도 절대 안 바뀐다.
function manageGrab(now) {
  // (1) 아직 아무것도 안 집음 → SCATTERED 에서 핀치로 하나 집기
  if (grabHand === null) {
    for (const h of HAND_LABELS) {
      const t = trackers[h];
      const pinchDown = t.visible && t.pinch && !prevPinch[h];
      if (pinchDown && appState === 'SCATTERED') {
        const item = browseScene.pickAt(t.cursor.x, t.cursor.y);
        if (item) {
          browseScene.grab(item);
          grabHands.Left = false; grabHands.Right = false;
          grabHands[h] = true;
          grabHand = h;
          grabReleaseAt = 0;
          appState = 'GRABBED';
          setStateLabel();
          break;
        }
      }
    }
    return;
  }

  // (2) 집은 상태(GRABBED)
  // (2a) 두 번째 손으로 같이 잡기(늘리기용): 주 손이 아닌 손이 밈 근처에서 핀치
  for (const h of HAND_LABELS) {
    if (h === grabHand) continue;
    const t = trackers[h];
    if (t.visible && t.pinch && !prevPinch[h] && isNearGrabbed(t.cursor)) grabHands[h] = true;
    if (!t.pinch || !t.visible) grabHands[h] = false;
  }

  // (2b) 주 손 핀치 유지/해제 — 잠깐 깜빡여도 바로 안 놓고 유예 시간만큼 기다림
  const primary = trackers[grabHand];
  if (primary.visible && primary.pinch) {
    grabHands[grabHand] = true;
    grabReleaseAt = 0;
  } else {
    grabHands[grabHand] = true; // 유예 동안엔 계속 잡은 것으로(위치 유지)
    if (grabReleaseAt === 0) grabReleaseAt = now;
    if (now - grabReleaseAt > CONFIG.grab.releaseGraceMs) {
      // 확실히 놓음 → 흩어진 상태로 복귀
      grabHand = null;
      grabReleaseAt = 0;
      grabHands.Left = false; grabHands.Right = false;
      browseScene.ungrab();
      appState = 'SCATTERED';
      setStateLabel();
    }
  }
}

function isNearGrabbed(cur) {
  const g = browseScene.grabbed;
  if (!g) return false;
  // 화면이 작으면(모바일) 밈도 작게 렌더되므로, 판정 범위도 같은 비율로 줄여야
  // 실제 보이는 크기와 어긋나지 않음.
  const vs = visualScale();
  const half = (CONFIG.browse.memeSize * g.scale * vs) / 2 + CONFIG.stretch.grabNearPad * vs;
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
    if (gp >= CONFIG.stretch.puzzleGap * gestureScale()) startPuzzle();
  }
}

// ----- 퍼즐 -----
function startPuzzle() {
  currentMeme = browseScene.grabbed.meme;
  const texture = browseScene.grabbed.texture;
  browseScene.hide();
  grabHands.Left = false; grabHands.Right = false;
  grabHand = null; grabReleaseAt = 0;
  puzzleHand = null; puzzleReleaseAt = 0;
  puzzleScene = new PuzzleScene(pixiApp, texture, onPuzzleSolved);
  appState = 'PUZZLE';
  setStateLabel();
}

// 퍼즐 조작: 한 손으로 집으면 그 손을 '고정'해서 놓을 때까지 그 손만 따라감.
// 핀치가 잠깐 깜빡여도 바로 안 놓고(유예) → 오놓기로 조각이 멋대로 바뀌거나 밀리는 것 방지.
function updatePuzzle(now) {
  if (puzzleHand === null) {
    // 아직 안 잡음 → 어느 손이든 '처음 핀치'로 조각 집기 시도
    for (const h of HAND_LABELS) {
      const t = trackers[h];
      if (t.visible && t.pinch && !prevPinch[h]) {
        if (puzzleScene.tryPick(t.cursor.x, t.cursor.y)) { puzzleHand = h; puzzleReleaseAt = 0; break; }
      }
    }
  } else {
    // 잡은 손만 추적
    const t = trackers[puzzleHand];
    if (t.visible && t.pinch) {
      puzzleReleaseAt = 0;
      puzzleScene.moveHeld(t.cursor.x, t.cursor.y); // 계속 잡고 이동
    } else {
      // 핀치가 풀리기 시작 — 유예 시간 이상 확실히 풀렸을 때만 진짜로 놓기(swap)
      if (puzzleReleaseAt === 0) puzzleReleaseAt = now;
      if (now - puzzleReleaseAt > CONFIG.puzzle.releaseGraceMs) {
        puzzleScene.drop();
        puzzleHand = null;
        puzzleReleaseAt = 0;
      }
      // 유예 중에는 조각을 마지막 위치에 그대로 둠(움직임만 멈춤)
    }
  }
  puzzleScene.update();
}

function quitPuzzle() {
  if (puzzleScene) { puzzleScene.destroy(); puzzleScene = null; }
  puzzleHand = null; puzzleReleaseAt = 0;
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
// 밈마다 <video> 를 미리 만들어 stage 에 숨겨두고, 음소거로 살짝 재생→정지해 예열한다.
// 이렇게 해두면 실제 완성 순간에 다운로드/디코딩을 기다리지 않고 바로 재생된다.
function buildRevealVideos() {
  for (const meme of CONFIG.memes) {
    const v = document.createElement('video');
    v.className = 'reveal-video';   // style.css 의 .reveal-video 스타일을 사용
    v.playsInline = true;
    v.muted = true;                 // 예열 동안 음소거(자동재생 정책 통과 + 디코더 예열)
    v.loop = false;
    v.preload = 'auto';             // 미리 전체 다운로드
    v.src = meme.video;
    // 크기는 재생 시작 시점(showReveal)에 그 퍼즐의 실제 보드 크기로 맞춥니다.
    // (화면 크기에 따라 보드 크기가 달라지므로 미리 고정해두지 않음)
    // 영상이 끝나면 자동으로 처음(흩어진 상태)으로 복귀
    v.addEventListener('ended', () => { if (appState === 'REVEAL') hideReveal(); });
    stageEl.appendChild(v);
    revealVideos[meme.id] = v;
    primeVideo(v);
  }
}

// 첫 프레임이 준비되면 음소거로 잠깐 재생했다가 멈춰서 디코더를 깨워둔다.
function primeVideo(v) {
  const warm = () => {
    v.removeEventListener('loadeddata', warm);
    const p = v.play();
    if (p && p.then) p.then(() => { v.pause(); v.currentTime = 0; }).catch(() => {});
  };
  v.addEventListener('loadeddata', warm);
}

function showReveal() {
  if (!currentMeme) return;
  const v = revealVideos[currentMeme.id];
  if (!v) return;
  activeReveal = v;
  // 방금까지 보던 퍼즐 보드와 같은 크기로 맞춰야 화면이 안 튀고 자연스럽게 이어짐
  const boardSize = puzzleScene ? puzzleScene.boardSize : CONFIG.puzzle.boardSize;
  v.style.width = boardSize + 'px';
  v.style.height = boardSize + 'px';
  v.currentTime = 0;
  v.muted = false;                 // 소리 켜고 재생 시도
  v.style.display = 'block';
  // 다음 프레임에 opacity 를 올려야 CSS 페이드가 작동
  requestAnimationFrame(() => { v.style.opacity = '1'; });
  v.play().catch(() => {
    // 소리 자동재생이 막히면(브라우저 정책) 음소거로라도 바로 재생
    v.muted = true;
    v.play().catch((e) => console.warn('영상 재생 실패:', e));
  });
}

function hideReveal() {
  const v = activeReveal;
  if (v) {
    v.pause();
    v.style.opacity = '0';
    // src 는 그대로 두어(다시 즉시 재생되도록) display 만 끄고 처음으로 되감기
    setTimeout(() => { v.style.display = 'none'; v.currentTime = 0; }, CONFIG.reveal.fadeMs);
  }
  activeReveal = null;
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
      hudHelpEl.textContent = `양손으로 잡음 · 더 벌리면 퍼즐! (${gp} / ${Math.round(CONFIG.stretch.puzzleGap * gestureScale())})`;
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
    grabHand = null; grabReleaseAt = 0;
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
