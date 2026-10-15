# 현장 관측 모자이크 뷰어

촬영 이름을 선택하면 GeoTIFF 모자이크를 위성지도 위에서 확대·이동할 수 있는 정적 웹앱입니다. 코드는 GitHub Pages, 데이터는 공유 Google Drive에 보관합니다. 별도 빌드 단계가 없습니다.

## 현재 상태

- GitHub Pages: https://kwak0426.github.io/mosaic-viewer/
- `catalog.json`은 Drive에 업로드된 9,985,587바이트 COG를 가리킵니다. 공개 다운로드 및 준비 파일과 SHA-256 일치를 확인했습니다.
- 공개 중계 서버: https://field-mosaic-relay.kskwak2.chatgpt.site
- GitHub 뷰어 → 공개 중계 서버 → 공유 Google Drive 순서로 현재 화면에 필요한 바이트 구간만 읽습니다. 익명 요청의 HTTP 206, CORS 및 실제 파일 바이트 일치를 검증했습니다.
- `relay/`는 Sites에 배포한 서버 소스입니다. TIFF 데이터는 Drive에 보관하며, 방문자 Google 로그인은 필요하지 않습니다.
- 원본 픽셀 수와 좌표를 보존한 압축 영상은 로컬 지도에서 검증했습니다.

## 기능

- 여러 촬영 기록 목록 및 이름 검색
- 선택한 이미지의 HTTP Range 부분 로딩 및 내부 축소 이미지 활용
- GeoTIFF 좌표에 따른 지도 배치, 원본 픽셀 수 유지
- 위성/일반 배경지도, 모자이크 투명도 및 표시 전환
- 확대·축소, 촬영 영역 맞춤, 북쪽 정렬, 전체 화면
- 휴대폰 화면의 목록 패널 및 터치 확대·이동
- 로딩·실패 상태와 재시도

## GitHub Pages 배포

이 디렉터리의 파일을 저장소 루트에 올립니다. 저장소 Settings → Pages → Deploy from a branch에서 `main` 및 `/ (root)`를 선택합니다. TIFF 원본·압축본은 저장소에 올리지 않습니다. 공개 사이트의 목록과 썸네일은 방문자가 볼 수 있습니다.

## 새 관측 자료 추가

1. 좌표가 포함된 RGB GeoTIFF를 준비합니다. 일반 JPEG/WebP로만 저장하면 좌표가 사라지므로 좌표를 보존하는 COG 형식을 권장합니다.
2. 아래 도구로 압축본과 목록 항목 JSON을 생성합니다.

   ```powershell
   python -m pip install -r tools/requirements.txt
   python tools/prepare.py input.tif output.cog.tif --title "관측 이름" --date 2026-10-15 --id observation-01 --white-background
   ```

   `--white-background`는 원본의 순백색 바깥 여백을 투명하게 만듭니다. 흰색 자체가 유효 자료인 영상에는 사용하지 않습니다. JPEG 92 압축은 손실 압축이며 공간 해상도를 줄이지 않습니다. 원본은 별도 보관합니다.
3. COG 파일을 공유 Drive 폴더에 업로드합니다. 사이트 방문자에게 읽기 및 다운로드 권한이 있어야 합니다.
4. 생성된 `.entry.json`의 `driveFileId`를 업로드한 파일 ID로 바꾸고, `catalog.json`의 `observations` 배열에 추가합니다. `sizeBytes`는 업로드한 파일의 정확한 크기입니다.
5. 중계 서버 `relay/lib/relay.ts`의 `FILES`에 같은 관측 ID, Drive 파일 ID, 정확한 바이트 크기를 등록하고 서버를 다시 배포합니다. 목록 항목의 `url`에는 배포한 서버의 `/api/cog?observation=관측ID` 주소를 지정합니다. 목록만 추가하면 서버에서 허용하지 않아 로딩되지 않습니다.
6. 썸네일 WebP와 갱신한 목록을 코드와 함께 저장합니다. 새로고침 버튼을 누르면 갱신된 목록을 읽습니다.

현재 목록은 `catalog.json`으로 관리합니다. Drive 폴더에 파일만 추가하는 자동 등록은 구현되어 있지 않습니다. 자동 등록이 필요하면 Drive API 인증과 변환 작업 경로를 추가해야 합니다.

## 데이터 로딩과 제한

- 목록의 `url`이 있으면 공개 중계 서버를 사용합니다. 서버에는 등록된 공개 파일 ID만 허용하며 방문자의 Google 로그인 쿠키는 사용하지 않습니다.
- 대용량 전체 파일 다운로드 fallback을 끄고 단일 바이트 범위 요청만 허용합니다.
- Drive의 직접 교차 사이트 요청 제한 때문에 공개 중계 서버를 사용합니다. Drive 공유 권한, 다운로드 할당량, 중계 서비스 가용성에 따라 로딩이 실패할 수 있습니다.
- Drive가 `Content-Range` 헤더를 브라우저에 노출하지 않는 경우, 정확한 목록 파일 크기와 단일 요청의 시작 바이트 및 노출된 응답 길이로 헤더를 보완합니다.
- 정적 앱에는 API 비밀키·Google 로그인 토큰이 포함되지 않습니다.
- EPSG:4326/3857 등 OpenLayers가 아는 좌표계를 사용하세요. 다른 좌표계는 재투영하거나 해당 좌표계 정의를 등록해야 합니다.
- 위성 배경은 Esri World Imagery, 일반지도는 OpenStreetMap입니다. 제공자 출처를 유지하며 서비스 조건·가용성에 따릅니다. 배경영상 촬영 시점은 드론 관측 날짜와 다를 수 있습니다.

## 라이브러리

OpenLayers 10.11.0 및 해당 버전이 요구하는 GeoTIFF.js 3.1.0-beta.0을 `vendor/`에 포함했습니다. 각 라이선스 파일을 함께 유지합니다.
