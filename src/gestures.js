// =============================================================
// 제스처 계산 모듈 (gestures.js)
// 손 랜드마크 21개에서 다음을 계산합니다:
//   - 커서 위치(검지 끝) → 화면 좌표로 변환 + 떨림 보정
//   - 커서 이동 속도(px/초) → 빠른 손동작 글리치 등에 사용
//   - 핀치(엄지+검지 집기) 여부 → 손 크기로 정규화 + 깜빡임 방지(디바운스)
//   - 주먹 쥐기 여부 → 취소/뒤로 제스처
//   - 손 쫙 펴짐(open) 여부 → 밈 흩어뜨리기 제스처
// 여기서 만든 결과를 BROWSE/GRAB/PUZZLE 에서 그대로 사용합니다.
// =============================================================

import { CONFIG } from './config.js';
import { OneEuroFilter } from './oneEuroFilter.js';

// MediaPipe 손 랜드마크 번호 (참고)
//   0: 손목,  4: 엄지 끝,  8: 검지 끝
//   5/9/13/17: 각 손가락 밑동(MCP),  6/10/14/18: 각 손가락 중간 관절(PIP)
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

// 네 손가락 [끝, 중간관절] 쌍 (엄지는 판정이 까다로워 제외)
const FINGERS = [
  [8, 6],   // 검지
  [12, 10], // 중지
  [16, 14], // 약지
  [20, 18], // 새끼
];

// 두 랜드마크 사이의 거리 (정규화 좌표 기준)
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class GestureTracker {
  constructor() {
    // 커서 x, y 각각에 떨림 보정 필터를 답니다.
    this.fx = new OneEuroFilter(CONFIG.cursor.minCutoff, CONFIG.cursor.beta);
    this.fy = new OneEuroFilter(CONFIG.cursor.minCutoff, CONFIG.cursor.beta);

    // 바깥에서 읽어가는 상태값
    this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.pinch = false;   // 지금 집고 있는가 (엄지+검지)
    this.fist = false;    // 지금 주먹인가
    this.open = false;    // 지금 손을 쫙 폈는가 (다섯 손가락 펴짐)
    this.visible = false; // 손이 화면에 보이는가
    this.speed = 0;       // 커서 이동 속도(px/초)

    // 디바운스(깜빡임 방지)용 내부 카운터
    this._pinchCount = 0;
    this._fistCount = 0;
    this._openCount = 0;
    // 속도 계산용 직전 값
    this._prevCursor = { x: this.cursor.x, y: this.cursor.y };
    this._prevTime = null;
  }

  /**
   * 한 손의 랜드마크로 상태를 갱신합니다.
   * @param {Array|null} landmarks 손 랜드마크 배열 (null 이면 손이 안 보이는 것)
   * @param {number} timestamp performance.now()
   */
  update(landmarks, timestamp) {
    if (!landmarks) {
      // 손이 안 보이면: 모든 제스처 풀고, 커서는 마지막 위치 유지.
      this.visible = false;
      this.speed = 0;
      this._setPinch(false);
      this._setFist(false);
      this._setOpen(false);
      return;
    }
    this.visible = true;

    // ---- 1) 커서: 검지 끝을 '화면 좌표'로 변환 + 떨림 보정 ----
    const tip = landmarks[INDEX_TIP];
    const nx = CONFIG.webcam.mirror ? 1 - tip.x : tip.x; // 거울 보정
    const ny = tip.y;
    const rawX = nx * window.innerWidth;
    const rawY = ny * window.innerHeight;
    this.cursor.x = this.fx.filter(rawX, timestamp);
    this.cursor.y = this.fy.filter(rawY, timestamp);

    // ---- 1-1) 커서 이동 속도(px/초) ----
    if (this._prevTime != null) {
      let dt = (timestamp - this._prevTime) / 1000;
      if (dt <= 0) dt = 1 / 60;
      const dpx = Math.hypot(this.cursor.x - this._prevCursor.x, this.cursor.y - this._prevCursor.y);
      this.speed = dpx / dt;
    }
    this._prevCursor.x = this.cursor.x;
    this._prevCursor.y = this.cursor.y;
    this._prevTime = timestamp;

    // ---- 2) 손 크기(거리 보정 기준): 손목 ~ 중지 밑동 ----
    const handScale = dist(landmarks[WRIST], landmarks[MIDDLE_MCP]) || 1e-6;

    // ---- 3) 핀치: (엄지끝~검지끝 거리) / (손 크기) 비율 ----
    const pinchRatio = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / handScale;
    if (!this.pinch && pinchRatio < CONFIG.gestures.pinchOnRatio) {
      this._pinchCount++;
      if (this._pinchCount >= CONFIG.gestures.pinchDebounceFrames) this._setPinch(true);
    } else if (this.pinch && pinchRatio > CONFIG.gestures.pinchOffRatio) {
      this._pinchCount++;
      if (this._pinchCount >= CONFIG.gestures.pinchDebounceFrames) this._setPinch(false);
    } else {
      this._pinchCount = 0;
    }

    // ---- 4) 주먹: 네 손가락이 모두 접힘 ----
    const folded = this._isFist(landmarks);
    if (folded !== this.fist) {
      this._fistCount++;
      if (this._fistCount >= CONFIG.gestures.fistDebounceFrames) this._setFist(folded);
    } else {
      this._fistCount = 0;
    }

    // ---- 5) 손 쫙 펴짐: 네 손가락 모두 펴지고 + 핀치도 아님 ----
    const isOpen = this._isOpenHand(landmarks) && !this.pinch;
    if (isOpen !== this.open) {
      this._openCount++;
      if (this._openCount >= CONFIG.gestures.fistDebounceFrames) this._setOpen(isOpen);
    } else {
      this._openCount = 0;
    }
  }

  // 네 손가락 끝이 중간 관절보다 손목에 '가까우면'(굽음) → 모두 굽으면 주먹
  _isFist(lm) {
    const wrist = lm[WRIST];
    for (const [tipI, pipI] of FINGERS) {
      if (dist(lm[tipI], wrist) > dist(lm[pipI], wrist)) return false; // 하나라도 펴짐 → 주먹 아님
    }
    return true;
  }

  // 네 손가락 끝이 중간 관절보다 손목에서 '멀면'(폄) → 모두 펴지면 펴진 손
  _isOpenHand(lm) {
    const wrist = lm[WRIST];
    for (const [tipI, pipI] of FINGERS) {
      if (dist(lm[tipI], wrist) < dist(lm[pipI], wrist)) return false; // 하나라도 굽음 → 펴진 손 아님
    }
    return true;
  }

  _setPinch(v) { if (this.pinch !== v) { this.pinch = v; this._pinchCount = 0; } }
  _setFist(v) { if (this.fist !== v) { this.fist = v; this._fistCount = 0; } }
  _setOpen(v) { if (this.open !== v) { this.open = v; this._openCount = 0; } }
}
