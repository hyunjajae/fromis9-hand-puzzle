// =============================================================
// One Euro Filter (oneEuroFilter.js)
// 손 좌표의 '덜덜 떨림'을 부드럽게 다듬는 필터입니다.
// 천천히 움직일 때는 떨림을 강하게 줄이고, 빠르게 움직일 때는
// 지연을 줄여서 반응성을 살려주는 똑똑한 필터예요. (제스처 UI 표준)
// 참고: https://gery.casiez.net/1euro/
// =============================================================

// 내부에서 쓰는 단순 저역통과 필터 (값을 부드럽게 평균내는 도구)
class LowPassFilter {
  constructor() {
    this.hasLast = false;
    this.lastValue = 0;
  }
  // alpha: 0~1 사이. 1에 가까울수록 새 값에 민감(덜 부드러움), 0에 가까울수록 부드러움.
  filter(value, alpha) {
    if (!this.hasLast) {
      this.hasLast = true;
      this.lastValue = value;
      return value;
    }
    this.lastValue = alpha * value + (1 - alpha) * this.lastValue;
    return this.lastValue;
  }
}

export class OneEuroFilter {
  /**
   * @param {number} minCutoff 작을수록 더 부드러움(떨림↓, 지연↑)
   * @param {number} beta 빠르게 움직일 때 지연을 줄여주는 정도
   * @param {number} dCutoff 속도 추정용 컷오프(보통 1.0 고정)
   */
  constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();  // 값 자체를 부드럽게
    this.dxFilter = new LowPassFilter(); // 값의 '변화 속도'를 부드럽게
    this.lastTime = null;
    this.lastValue = 0;
  }

  // 컷오프 주파수 → alpha 변환 (dt = 프레임 간격(초))
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /**
   * @param {number} value 이번 측정값
   * @param {number} timestamp 현재 시각(ms, performance.now() 사용)
   * @returns {number} 부드럽게 보정된 값
   */
  filter(value, timestamp) {
    // 두 프레임 사이 시간 간격(초). 첫 호출이면 60fps 로 가정.
    let dt = 1 / 60;
    if (this.lastTime != null) {
      dt = (timestamp - this.lastTime) / 1000;
      if (dt <= 0) dt = 1 / 60;
    }
    this.lastTime = timestamp;

    // 값의 변화 속도를 추정해서 부드럽게
    const dValue = (value - this.lastValue) / dt;
    const edValue = this.dxFilter.filter(dValue, this.alpha(this.dCutoff, dt));

    // 빠르게 움직일수록 컷오프를 키워(덜 부드럽게) 지연을 줄여줍니다.
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    const filtered = this.xFilter.filter(value, this.alpha(cutoff, dt));

    this.lastValue = value;
    return filtered;
  }
}
