// =============================================================
// 설정 파일 (config.js)
// 내가 자주 바꾸게 될 값들을 여기 한 군데에 모아둡니다.
// 이것저것 조절하고 싶으면 항상 여기부터 보세요. (저장하면 화면 자동 새로고침)
// =============================================================

// GitHub Pages 같은 하위 경로 배포에서도 이미지/영상 경로가 깨지지 않도록,
// Vite 가 알려주는 BASE_URL(예: '/fromis9-hand-puzzle/')을 앞에 붙여줍니다.
const BASE = import.meta.env.BASE_URL;

export const CONFIG = {
  // ----- 웹캠 설정 -----
  webcam: {
    width: 1280,        // 요청할 영상 가로 해상도 (브라우저가 가능한 비슷한 값으로 맞춰줍니다)
    height: 720,        // 요청할 영상 세로 해상도
    facingMode: 'user', // 'user' = 앞쪽(셀카) 카메라
    mirror: true,       // 거울 모드(좌우 반전) 켜기. false 로 두면 반전 안 함.
  },

  // ----- 손 인식 / 그리기 설정 -----
  hands: {
    numHands: 2,           // 동시에 추적할 손 개수 (2 = 양손 모두 인식)
    showLandmarks: true,   // 손 관절 점·선 오버레이를 그릴지 (나중에 false 로 끄면 깔끔해짐)
    lineColor: '#22d3ee',  // 손 뼈대(연결선) 색
    lineWidth: 4,          // 연결선 두께 (영상 해상도 기준 픽셀)
    pointColor: '#ffffff', // 관절 점 색
    pointRadius: 5,        // 관절 점 크기
  },

  // ----- 제스처(핀치·주먹) 판정 설정 -----
  gestures: {
    // 핀치(집기): 엄지끝~검지끝 거리를 '손 크기'로 나눈 '비율'로 판정합니다.
    // (비율로 보면 손이 카메라에서 멀어져도 일관되게 동작해요.)
    pinchOnRatio: 0.40,     // 이 값보다 작아지면 핀치 ON (작을수록 더 꽉 집어야 인식)
    pinchOffRatio: 0.62,    // 이 값보다 커지면 핀치 OFF (ON 값과 갭을 넓혀 깜빡임 방지)
    pinchDebounceFrames: 3, // 몇 프레임 연속 만족해야 상태가 바뀌는지 (오인식/깜빡임 방지)
    fistDebounceFrames: 3,  // 손 펴짐(open) 판정에도 사용
  },

  // ----- 커서(검지 끝) 설정 -----
  cursor: {
    size: 28,               // 커서 원 지름(px)
    color: '#ffffff',       // 평소 커서 색
    pinchColor: '#ff3b6b',  // 핀치 중일 때 커서 색
    // 떨림 보정(One Euro Filter) 강도
    minCutoff: 1.5,         // 작을수록 더 부드러움 (떨림↓, 대신 살짝 느려짐)
    beta: 0.05,             // 빠르게 움직일 때 지연을 줄여주는 정도 (크면 빠른 동작에 더 민감)
  },

  // ----- 밈 목록 -----
  // 밈 1개 = 정지 이미지(영상의 첫 프레임) + 영상.
  // 진짜 파일이 생기면 public/memes/ 에 같은 이름으로 덮어쓰면 됩니다.
  // 추가/삭제는 이 배열만 고치면 돼요. (영상 mp4 는 7단계 REVEAL 에서 사용)
  memes: [
    { id: 'meme1', image: BASE + 'memes/meme1.png', video: BASE + 'memes/meme1.mp4' },
    { id: 'meme2', image: BASE + 'memes/meme2.png', video: BASE + 'memes/meme2.mp4' },
    { id: 'meme3', image: BASE + 'memes/meme3.png', video: BASE + 'memes/meme3.mp4' },
    { id: 'meme4', image: BASE + 'memes/meme4.png', video: BASE + 'memes/meme4.mp4' },
    { id: 'meme5', image: BASE + 'memes/meme5.png', video: BASE + 'memes/meme5.mp4' },
    { id: 'meme6', image: BASE + 'memes/meme6.png', video: BASE + 'memes/meme6.mp4' },
    { id: 'meme7', image: BASE + 'memes/meme7.png', video: BASE + 'memes/meme7.mp4' },
    { id: 'meme8', image: BASE + 'memes/meme8.png', video: BASE + 'memes/meme8.mp4' },
    { id: 'meme9', image: BASE + 'memes/meme9.png', video: BASE + 'memes/meme9.mp4' },
    { id: 'meme10', image: BASE + 'memes/meme10.png', video: BASE + 'memes/meme10.mp4' },

  ],

  // ----- BROWSE(탐색) 단계 설정 -----
  browse: {
    memeSize: 200,          // 밈 한 변 크기(px)
    floatAmplitude: 14,     // 떠다니는 흔들림 폭(px) — 클수록 많이 움직임
    floatSpeed: 0.6,        // 떠다니는 속도 — 클수록 빠르게 일렁임
    hoverScale: 1.18,       // 커서가 올라갔을 때 확대 배율
    normalScale: 1.0,       // 평소 배율
    scaleLerp: 0.18,        // 확대/축소가 따라붙는 부드러움(0~1, 클수록 빠름)
    // 손을 빠르게 움직일 때 RGB 글리치(색 어긋남) 이펙트 — '양념 수준'으로 약하게
    glitchSpeedStart: 700,  // 커서 속도(px/초)가 이 값을 넘으면 글리치 시작
    glitchSpeedFull: 2500,  // 이 속도에서 글리치 최대
    glitchMaxOffset: 10,    // 글리치 최대 색 어긋남(px)
  },

  // ----- B2 소환(SUMMON) 설정 -----
  // 양손을 '붙였다가(closeGap 이하) → 벌리면(openGap 이상)' 밈이 원형으로 등장.
  summon: {
    closeGap: 120,        // 양손 간격이 이 값보다 작아지면 '장전'(붙임 인식)
    openGap: 500,         // 장전 후 이 값보다 벌어지면 소환 발동
    armWindow: 1.5,       // 장전 후 이 시간(초) 안에 벌리면 소환 — 빨리 벌려도 인식되게
    radiusFactor: 0.5,    // 원 반경 = 양손간격 × 이 값
    minRadius: 120,       // 원 최소 반경(px)
    maxRadius: 480,       // 원 최대 반경(px)
    rotateSpeed: 1.2,     // 원이 도는 속도(라디안/초) — 클수록 빨리 빙글빙글
    memeScale: 0.9,       // 소환된 밈 크기 배율(browse.memeSize 기준)
    glitchBase: 0.35,     // 소환 중 항상 깔리는 기본 글리치 강도(0~1) — '지글지글'
    moveLerp: 0.18,       // 밈이 목표 위치로 따라붙는 부드러움(0~1, 클수록 빠름)
  },

  // ----- B4 집기(GRAB) 설정 -----
  grab: {
    scale: 1.4,    // (참고용) 집었을 때 기본 배율
    popScale: 1.8, // 집는 순간 살짝 튀어오르는 배율(팝 이펙트)
    popTime: 0.22, // 팝 지속 시간(초)
    // 핀치가 잠깐 깜빡여도 바로 안 놓게 하는 유예 시간(ms).
    // 이 시간보다 짧게 풀렸다 다시 잡히면 '계속 잡은 것'으로 봅니다. (밈이 안 바뀜)
    releaseGraceMs: 200,
  },

  // ----- B5 늘리기(STRETCH) 설정 -----
  // 한 손으로 끌고 다니다가, 다른 손으로도 같이 잡아 벌리면 밈이 커집니다.
  stretch: {
    dragScale: 1.2,     // 한 손으로 끌고 다닐 때 밈 크기 배율
    scalePerPx: 0.005,  // 양손으로 잡았을 때: 밈 배율 = 양손간격(px) × 이 값 (0.005 = 200px당 1배)
    minScale: 0.8,      // 늘리기 최소 배율
    grabNearPad: 70,    // 두 번째 손이 '같이 잡았다'고 인정하는 밈 주변 여유(px)
    puzzleGap: 520,     // 양손 간격이 이 값 이상이 되면 → 퍼즐 시작
  },

  // ----- 퍼즐(PUZZLE) 설정 -----
  puzzle: {
    gridSize: 3,        // 3 = 3×3
    boardSize: 480,     // 퍼즐 보드 한 변(px) — 화면 중앙에 표시
    gap: 6,             // 조각 사이 간격(px)
    pickScale: 1.08,    // 집어 든 조각이 살짝 커지는 배율
    minShuffle: 6,      // 처음 섞을 때 최소 이만큼 자리가 어긋나게
    // 핀치가 잠깐 깜빡여도 바로 안 놓게 하는 유예 시간(ms).
    // 이 시간 이상 확실히 핀치를 풀어야 자리 바꿈(swap)이 일어납니다. (오놓기/밀림 방지)
    releaseGraceMs: 200,
  },

  // ----- 7단계 REVEAL(영상 재생) 설정 -----
  reveal: {
    startDelayMs: 450,  // 퍼즐 완성 후 영상이 뜨기까지 딜레이(ms) — 완성된 그림을 잠깐 보여줌
    fadeMs: 500,        // 영상이 부드럽게 나타나는 시간(ms)
  },
};
