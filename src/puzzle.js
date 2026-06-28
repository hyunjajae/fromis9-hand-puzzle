// =============================================================
// 퍼즐 씬 (puzzle.js)
// 집은 밈 이미지를 3×3 으로 잘라 섞고, 손으로 조각을 집어 옮겨
// 다른 조각과 자리를 바꾸는(swap) 퍼즐입니다. 다 맞추면 onSolved() 호출.
//
// 조작(사진 레퍼런스와 동일):
//   커서 이동 → 조각 위에서 핀치로 집기 → 다른 조각으로 옮겨 놓으면 두 조각이 swap
// =============================================================

import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { CONFIG, visualScale } from './config.js';

export class PuzzleScene {
  /**
   * @param {Application} app PixiJS 앱
   * @param {Texture} texture 집은 밈의 전체 텍스처(이걸 3×3 으로 자름)
   * @param {Function} onSolved 다 맞췄을 때 호출
   */
  constructor(app, texture, onSolved) {
    this.app = app;
    this.texture = texture;
    this.onSolved = onSolved;
    this.container = new Container();
    app.stage.addChild(this.container);

    this.n = CONFIG.puzzle.gridSize;
    this.pieces = []; // { correct, slot, sprite, cont, x, y, scale }
    this.held = null; // 지금 집어 든 조각
    this.solved = false;

    // 화면이 작으면(모바일) 보드 자체도 비례해서 작게 — 그대로 두면 작은 화면을
    // 꽉 채우거나 넘쳐서 조각을 옮기기 어려움. (REVEAL 영상 크기도 이 값을 그대로 씀)
    this.boardSize = CONFIG.puzzle.boardSize * visualScale();
    this.gap = CONFIG.puzzle.gap * visualScale();

    this._build();
    this._shuffle();
  }

  // 보드 좌상단 좌표(화면 중앙 정렬)
  _boardOrigin() {
    const b = this.boardSize;
    return { x: this.app.renderer.width / 2 - b / 2, y: this.app.renderer.height / 2 - b / 2 };
  }
  // 조각 한 칸 크기
  _cell() {
    const b = this.boardSize, g = this.gap, n = this.n;
    return (b - g * (n - 1)) / n;
  }
  // slot(0~8) 의 화면 중심 좌표
  _slotPos(slot) {
    const n = this.n, cell = this._cell(), g = this.gap, o = this._boardOrigin();
    const r = Math.floor(slot / n), c = slot % n;
    return { x: o.x + c * (cell + g) + cell / 2, y: o.y + r * (cell + g) + cell / 2 };
  }

  // 텍스처를 3×3 으로 잘라 조각 스프라이트 만들기
  _build() {
    const n = this.n;
    const src = this.texture.source;
    const tw = this.texture.width, th = this.texture.height;
    const pw = tw / n, ph = th / n;
    const cell = this._cell();

    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      // 원본 이미지에서 이 조각이 차지하는 사각 영역
      const frame = new Rectangle(c * pw, r * ph, pw, ph);
      const tex = new Texture({ source: src, frame });
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = cell;
      sp.height = cell;
      // 조각 테두리(구분용)
      const border = new Graphics()
        .rect(-cell / 2, -cell / 2, cell, cell)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      const cont = new Container();
      cont.addChild(sp, border);
      this.container.addChild(cont);

      const piece = { correct: i, slot: i, sprite: sp, cont, x: 0, y: 0, scale: 1 };
      const p = this._slotPos(i);
      piece.x = p.x; piece.y = p.y;
      cont.x = p.x; cont.y = p.y;
      this.pieces.push(piece);
    }
  }

  // 풀 수 있게 섞기 (swap 퍼즐은 어떤 순열이든 풀 수 있음). 너무 안 섞이지 않게 보장.
  _shuffle() {
    const total = this.n * this.n;
    let order = [...Array(total).keys()];
    let guard = 0;
    do {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      guard++;
    } while (this._matchCount(order) > total - CONFIG.puzzle.minShuffle && guard < 50);
    this.pieces.forEach((pc, i) => { pc.slot = order[i]; });
  }
  _matchCount(order) {
    let m = 0;
    for (let i = 0; i < order.length; i++) if (order[i] === i) m++;
    return m;
  }

  pieceAtSlot(slot) { return this.pieces.find((p) => p.slot === slot); }

  // 화면 좌표가 어느 slot 위인지 (보드 밖이면 -1)
  slotAt(x, y) {
    const n = this.n, cell = this._cell(), g = this.gap, o = this._boardOrigin();
    const b = this.boardSize;
    if (x < o.x || x > o.x + b || y < o.y || y > o.y + b) return -1;
    const c = Math.floor((x - o.x) / (cell + g));
    const r = Math.floor((y - o.y) / (cell + g));
    if (c < 0 || c >= n || r < 0 || r >= n) return -1;
    return r * n + c;
  }

  // 좌표에서 '가장 가까운' slot (칸을 살짝 벗어나도 잡아줌 / 너무 멀면 -1)
  nearestSlot(x, y) {
    let best = -1, bestD = Infinity;
    for (let s = 0; s < this.n * this.n; s++) {
      const p = this._slotPos(s);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return bestD < this._cell() * 1.2 ? best : -1;
  }

  // (x,y) 위의 조각을 집습니다. 성공하면 true. (main 이 '잡은 손'을 고정해서 호출)
  tryPick(x, y) {
    if (this.held) return false;
    const slot = this.slotAt(x, y);
    if (slot < 0) return false;
    this.held = this.pieceAtSlot(slot);
    this.held.x = x; this.held.y = y;
    return true;
  }

  // 든 조각을 커서 위치로 이동
  moveHeld(x, y) {
    if (this.held) { this.held.x = x; this.held.y = y; }
  }

  // 든 조각을 가장 가까운 칸에 놓기(swap) + 정답 확인. (핀치를 풀었을 때 호출)
  drop() {
    if (!this.held) return;
    const slot = this.nearestSlot(this.held.x, this.held.y);
    if (slot >= 0 && slot !== this.held.slot) {
      const other = this.pieceAtSlot(slot);
      const tmp = this.held.slot;
      this.held.slot = slot;
      other.slot = tmp;
    }
    this.held = null;
    this._checkSolved();
  }

  // 매 프레임: 모든 조각 위치/크기를 부드럽게 갱신 (조작은 위 tryPick/moveHeld/drop)
  update() {
    for (const pc of this.pieces) {
      let tx, ty, ts;
      if (pc === this.held) {
        tx = this.held.x; ty = this.held.y; ts = CONFIG.puzzle.pickScale;
      } else {
        const p = this._slotPos(pc.slot);
        tx = p.x; ty = p.y; ts = 1;
      }
      pc.x += (tx - pc.x) * 0.35;
      pc.y += (ty - pc.y) * 0.35;
      pc.scale += (ts - pc.scale) * 0.35;
      pc.cont.x = pc.x; pc.cont.y = pc.y;
      pc.cont.scale.set(pc.scale);
    }
    if (this.held) this.container.setChildIndex(this.held.cont, this.pieces.length - 1);
  }

  _checkSolved() {
    if (this.solved) return;
    if (this.pieces.every((p) => p.slot === p.correct)) {
      this.solved = true;
      if (this.onSolved) this.onSolved();
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
