// =============================================================
// 손 인식 모듈 (handTracking.js)
// 구글 MediaPipe 의 HandLandmarker 를 초기화하고,
// 웹캠 영상에서 손 관절 21개의 위치를 찾아주는 일을 담당합니다.
// =============================================================

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { CONFIG } from './config.js';

// MediaPipe 가 내부적으로 쓰는 wasm(웹어셈블리) 파일 묶음을 받아올 CDN 경로.
// ⚠️ 설치한 패키지 버전(0.10.35)과 똑같이 맞춰야 안전합니다.
//    (package.json 의 @mediapipe/tasks-vision 버전을 올리면 이 숫자도 같이 바꿔주세요.)
const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

// 손 인식에 쓰는 '학습된 모델' 파일. 구글이 공식으로 호스팅하는 주소를 사용합니다.
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * 손 인식기(HandLandmarker)를 만들어서 돌려줍니다.
 * 모델/wasm 을 인터넷에서 받아오므로 처음엔 1~2초 걸릴 수 있어요 (그동안 "로딩 중" 표시).
 * @returns {Promise<HandLandmarker>}
 */
export async function createHandLandmarker() {
  // 1) wasm 파일 묶음 준비
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

  // 2) 손 인식기 생성 ('영상' 모드)
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate: 'GPU', // 가능하면 GPU 가속 사용 (데스크톱 Chrome 권장)
    },
    runningMode: 'VIDEO', // 정지 이미지가 아니라 '영상'을 연속으로 처리하는 모드
    numHands: CONFIG.hands.numHands,
  });

  return handLandmarker;
}
