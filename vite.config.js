// =============================================================
// Vite 개발 서버 설정 (vite.config.js)
// Vite = 개발 서버 + 빌드 도구. npm run dev 로 localhost 서버를 띄워줍니다.
// (웹캠은 localhost 또는 https 에서만 켜지기 때문에 이 서버가 꼭 필요해요.)
// =============================================================
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 는 https://계정.github.io/저장소이름/ 처럼 '하위 경로'에 올라가기 때문에,
  // 빌드 결과물의 모든 경로 앞에 저장소 이름을 붙여줘야 합니다. (안 붙이면 파일들이 다 404 남)
  base: '/fromis9-hand-puzzle/',
  server: {
    open: true, // npm run dev 를 실행하면 기본 브라우저로 페이지를 자동으로 열어줍니다.
  },
});
