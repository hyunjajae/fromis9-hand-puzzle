// =============================================================
// BROWSE 씬 (browse.js) — 밈들의 등장/회전/흩어짐/집기를 담당
// 모드 4가지:
//   - 'hidden'    : 밈이 화면 중앙에 모여 숨겨진 상태 (시작)
//   - 'summoned'  : 양손 중점 주위를 원형으로 빙글빙글 + 글리치 (소환)
//   - 'scattered' : 화면 사방으로 흩어져 둥둥 떠다님
//   - 'grabbed'   : 고른 밈 하나가 중앙으로 와서 커짐, 나머지는 사라짐
// 각 밈은 '목표 위치'로 부드럽게(lerp) 따라가므로 모드가 바뀌면 자연스럽게 이동합니다.
// =============================================================

import { Assets, Container, Sprite } from 'pixi.js';
import { CONFIG, visualScale } from './config.js';

// 밈 하나. 글리치(색 어긋남)를 위해 [빨강 잔상 / 본체 / 파랑 잔상] 3겹.
class MemeItem {
  constructor(texture, meme) {
    this.meme = meme;
    this.texture = texture;
    this.container = new Container();

    this.ghostR = new Sprite(texture);
    this.main = new Sprite(texture);
    this.ghostB = new Sprite(texture);
    this.baseScale = CONFIG.browse.memeSize / Math.max(texture.width, texture.height);
    for (const s of [this.ghostR, this.main, this.ghostB]) s.anchor.set(0.5);
    this.ghostR.tint = 0xff3366;
    this.ghostB.tint = 0x33ccff;
    this.ghostR.alpha = 0;
    this.ghostB.alpha = 0;
    this.container.addChild(this.ghostR, this.main, this.ghostB);
    // 로딩~소환 전까지 절대 안 보이게. (안 하면 첫 프레임에 좌상단(0,0)에 큰 밈이 깜빡임)
    this.container.alpha = 0;

    // 현재 상태(실제 표시값)
    this.x = 0; this.y = 0; this.scale = 0.1; this.alpha = 0;
    // 목표 상태(여기로 매 프레임 부드럽게 다가감)
    this.tx = 0; this.ty = 0; this.tscale = 0.1; this.talpha = 0;

    this.zDepth = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.scatterX = 0; this.scatterY = 0;
    this.popT = 0; // 집을 때 팝 이펙트 남은 시간(초)
  }

  setTarget(x, y, scale, alpha) { this.tx = x; this.ty = y; this.tscale = scale; this.talpha = alpha; }
  snapTo(x, y) { this.x = x; this.y = y; }

  update(glitch) {
    const k = CONFIG.summon.moveLerp;
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.scale += (this.tscale - this.scale) * k;
    this.alpha += (this.talpha - this.alpha) * k;

    // 화면이 작으면(모바일) 밈 자체도 비례해서 작게 — 안 그러면 작은 화면에 사진이 너무 커서
    // 원형으로 돌리거나 흩어놓기가 잘 안 됨.
    const vs = visualScale();
    const sc = this.baseScale * this.scale * vs;
    this.container.x = this.x;
    this.container.y = this.y;
    this.container.scale.set(sc);
    this.container.alpha = this.alpha;

    const off = glitch * CONFIG.browse.glitchMaxOffset * vs;
    const localOff = off / (sc || 0.001);
    this.ghostR.x = -localOff;
    this.ghostB.x = localOff;
    this.ghostR.alpha = glitch * 0.6 * this.alpha;
    this.ghostB.alpha = glitch * 0.6 * this.alpha;
  }

  // 화면 좌표(px)가 이 밈 위에 있는지 (실제 렌더 크기와 같은 비율로 판정해야 정확함)
  hitTest(px, py) {
    const half = (CONFIG.browse.memeSize * this.scale * visualScale()) / 2;
    return px >= this.x - half && px <= this.x + half && py >= this.y - half && py <= this.y + half;
  }
}

export class BrowseScene {
  constructor(app) {
    this.app = app;
    this.layer = new Container();
    app.stage.addChild(this.layer);
    this.items = [];
    this.mode = 'hidden';
    this.angle = 0;
    this.center = { x: 0, y: 0 };
    this.radius = CONFIG.summon.minRadius;
    this.grabbed = null; // 집은 밈
  }

  async load() {
    for (const meme of CONFIG.memes) {
      const texture = await Assets.load(meme.image);
      const item = new MemeItem(texture, meme);
      this.items.push(item);
      this.layer.addChild(item.container);
    }
    this.hideAll();
  }

  screenCenter() { return { x: this.app.renderer.width / 2, y: this.app.renderer.height / 2 }; }

  hideAll() {
    const c = this.screenCenter();
    for (const it of this.items) { it.snapTo(c.x, c.y); it.setTarget(c.x, c.y, 0.1, 0); }
    this.center = { ...c };
  }

  summon(center) {
    this.mode = 'summoned';
    this.center = { ...center };
    for (const it of this.items) it.snapTo(center.x, center.y);
  }

  scatter() {
    this.mode = 'scattered';
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;
    const cols = 3;
    const rows = Math.ceil(this.items.length / cols);
    const cellW = W / cols;
    const cellH = H / (rows + 0.3);
    this.items.forEach((item, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      item.scatterX = cellW * (c + 0.5) + (Math.random() - 0.5) * cellW * 0.25;
      item.scatterY = cellH * (r + 0.7) + (Math.random() - 0.5) * cellH * 0.25;
    });
  }

  // 화면 좌표 위에 있는 (흩어진) 밈 하나 고르기 — 앞쪽(배열 뒤) 우선
  pickAt(x, y) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].hitTest(x, y)) return this.items[i];
    }
    return null;
  }

  // 집기: 고른 밈을 중앙으로, 나머지는 숨김
  grab(item) {
    this.mode = 'grabbed';
    this.grabbed = item;
    item.popT = CONFIG.grab.popTime; // 팝 이펙트 시작
  }

  // 집기 취소: 다시 흩어진 상태로 (위치는 유지)
  ungrab() {
    this.mode = 'scattered';
    this.grabbed = null;
  }

  hide() { this.mode = 'hidden'; this.grabbed = null; this.hideAll(); }

  layout() {
    if (this.mode === 'hidden') this.hideAll();
    else if (this.mode === 'scattered') this.scatter();
  }

  _speedGlitch(speed) {
    const g = CONFIG.browse;
    const v = (speed - g.glitchSpeedStart) / (g.glitchSpeedFull - g.glitchSpeedStart);
    return Math.max(0, Math.min(1, v));
  }

  /**
   * 매 프레임 갱신.
   * @param {number} dt 프레임 간격(초)
   * @param {number} t 시간(초)
   * @param {{center,gap,speed,bothVisible}} info 양손 정보
   */
  update(dt, t, info) {
    let glitch = 0;

    if (this.mode === 'summoned') {
      this.angle += CONFIG.summon.rotateSpeed * dt;
      if (info.bothVisible) {
        this.center.x += (info.center.x - this.center.x) * 0.2;
        this.center.y += (info.center.y - this.center.y) * 0.2;
        // 화면이 작으면(모바일) 원 반경의 최소/최대도 같은 비율로 줄여서, 작은 화면에서도
        // 원이 화면을 벗어나지 않고 양손 움직임만으로 적당한 크기가 되게 함.
        const vs = visualScale();
        const want = Math.max(
          CONFIG.summon.minRadius * vs,
          Math.min(CONFIG.summon.maxRadius * vs, info.gap * CONFIG.summon.radiusFactor)
        );
        this.radius += (want - this.radius) * 0.2;
      }
      glitch = Math.max(CONFIG.summon.glitchBase, this._speedGlitch(info.speed));

      const N = this.items.length;
      this.items.forEach((it, i) => {
        const a = (i / N) * Math.PI * 2 + this.angle;
        const depth = 0.7 + 0.3 * Math.sin(a);
        const tx = this.center.x + Math.cos(a) * this.radius;
        const ty = this.center.y + Math.sin(a) * this.radius * 0.55;
        it.setTarget(tx, ty, CONFIG.summon.memeScale * depth, 1);
        it.zDepth = depth;
      });
      this.items.slice().sort((p, q) => p.zDepth - q.zDepth)
        .forEach((it, idx) => this.layer.setChildIndex(it.container, idx));

    } else if (this.mode === 'scattered') {
      glitch = this._speedGlitch(info.speed);
      const amp = CONFIG.browse.floatAmplitude * visualScale();
      const sp = CONFIG.browse.floatSpeed;
      for (const it of this.items) {
        const fx = Math.sin(t * sp + it.phase) * amp;
        const fy = Math.cos(t * sp * 0.9 + it.phase) * amp;
        it.setTarget(it.scatterX + fx, it.scatterY + fy, CONFIG.browse.normalScale, 1);
      }

    } else if (this.mode === 'grabbed' && this.grabbed) {
      // 잡은 손 커서 목록(main 에서 전달). 1개=드래그, 2개=양손 늘리기.
      const hands = (info.grab && info.grab.hands) || [];
      let gx, gy, gscale;
      if (hands.length >= 2) {
        gx = (hands[0].x + hands[1].x) / 2;
        gy = (hands[0].y + hands[1].y) / 2;
        const gp = Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y);
        gscale = Math.max(CONFIG.stretch.minScale, gp * CONFIG.stretch.scalePerPx);
      } else if (hands.length === 1) {
        gx = hands[0].x; gy = hands[0].y; gscale = CONFIG.stretch.dragScale;
      } else {
        // 잡은 손이 잠깐 없으면 현재 자리 유지
        gx = this.grabbed.x; gy = this.grabbed.y; gscale = this.grabbed.scale;
      }
      // 집는 순간 팝
      if (this.grabbed.popT > 0) {
        this.grabbed.popT -= dt;
        const p = 1 - Math.max(0, this.grabbed.popT) / CONFIG.grab.popTime;
        gscale += Math.sin(Math.min(1, p) * Math.PI) * (CONFIG.grab.popScale - CONFIG.stretch.dragScale);
      }
      glitch = this._speedGlitch(info.speed);
      for (const it of this.items) {
        if (it === this.grabbed) it.setTarget(gx, gy, gscale, 1);
        else it.setTarget(it.x, it.y, it.scale, 0); // 나머지는 제자리에서 사라짐
      }
      this.layer.setChildIndex(this.grabbed.container, this.items.length - 1);
    }

    for (const it of this.items) it.update(glitch);
  }
}
