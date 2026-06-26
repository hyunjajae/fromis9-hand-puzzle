// =============================================================
// 웹캠 모듈 (webcam.js)
// 브라우저의 카메라를 켜서 <video> 요소에 영상을 흘려보내는 일만 담당합니다.
// 거울 모드(좌우 반전)는 CSS(.mirror)에서 처리하므로 여기서는 신경 쓰지 않습니다.
// =============================================================

import { CONFIG } from './config.js';

/**
 * 웹캠을 시작해서 주어진 <video> 요소에 연결합니다.
 * @param {HTMLVideoElement} videoEl - 영상을 표시할 video 태그
 * @returns {Promise<MediaStream>} 연결된 카메라 스트림
 */
export async function startWebcam(videoEl) {
  // 1) 브라우저가 카메라 API(getUserMedia)를 지원하는지 먼저 확인합니다.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('이 브라우저는 카메라(getUserMedia)를 지원하지 않습니다.');
  }

  // 2) 카메라 권한을 요청하고 영상 스트림을 받아옵니다.
  //    (localhost 또는 https 환경에서만 동작합니다. 그래서 npm run dev 로 띄우는 거예요.)
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: CONFIG.webcam.width },
      height: { ideal: CONFIG.webcam.height },
      facingMode: CONFIG.webcam.facingMode,
    },
    audio: false, // 소리는 필요 없습니다.
  });

  // 3) 받은 스트림을 video 요소에 연결합니다.
  videoEl.srcObject = stream;

  // 4) 영상의 크기 정보가 준비될 때까지 기다린 뒤 재생을 시작합니다.
  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => resolve();
  });
  await videoEl.play();

  return stream;
}
