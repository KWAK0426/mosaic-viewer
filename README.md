# 현장 관측 모자이크 뷰어

촬영 이름을 선택하면 GeoTIFF 모자이크를 위성지도 위에서 확대·이동할 수 있는 정적 웹앱입니다. 코드는 GitHub Pages, 데이터는 공유 Google Drive에 보관합니다. 별도 빌드 단계가 없습니다.

## 현재 상태

- `catalog.json`의 첫 항목은 사용자가 공유한 **기존 원본 TIFF**를 가리킵니다.
- 약 9.5 MiB의 압축 COG는 별도 결과 파일로 준비했습니다. Drive에 올리고 파일 ID·정확한 바이트 크기를 목록에 반영한 후 압축본을 사용합니다.
- 압축본을 로컬 HTTP Range 서버에서 검증했고, 위성지도와 겹쳐 표시되는 것을 확인했습니다.
- Google Drive 브라우저 직접 로딩은 추가 검증 중입니다. 공개 배포 성공을 확인하기 전까지 운영 완료로 취급하지 마세요.
- GitHub 저장소: https://github.com/KWAK0426/mosaic-viewer
- Pages 배포는 아직 완료하지 않았습니다. 압축본 Drive 업로드는 브라우저 접근 승인 대기 중입니다.

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
5. 썸네일 WebP를 코드와 함께 저장합니다. 새로고침 버튼을 누르면 갱신된 목록을 읽습니다.

현재 목록은 `catalog.json`으로 관리합니다. Drive 폴더에 파일만 추가하는 자동 등록은 구현되어 있지 않습니다. 자동 등록이 필요하면 Drive API 인증과 변환 작업 경로를 추가해야 합니다.

## 데이터 로딩과 제한

- 파일 링크는 다운로드 가능한 공개 원본 URL로 변환합니다. 방문자의 Google 로그인 쿠키는 사용하지 않습니다.
- 대용량 전체 파일 다운로드 fallback을 끄고 단일 바이트 범위 요청만 허용합니다.
- Drive는 Range와 CORS를 지원하더라도 브라우저·다운로드 제한·할당량에 따라 오류가 날 수 있습니다. 실제 공개 주소에서 PC와 휴대폰 검증이 필요합니다.
- Drive가 `Content-Range` 헤더를 브라우저에 노출하지 않는 경우, 정확한 목록 파일 크기와 단일 요청의 시작 바이트 및 노출된 응답 길이로 헤더를 보완합니다.
- 정적 앱에는 API 비밀키·Google 로그인 토큰이 포함되지 않습니다.
- EPSG:4326/3857 등 OpenLayers가 아는 좌표계를 사용하세요. 다른 좌표계는 재투영하거나 해당 좌표계 정의를 등록해야 합니다.
- 위성 배경은 Esri World Imagery, 일반지도는 OpenStreetMap입니다. 제공자 출처를 유지하며 서비스 조건·가용성에 따릅니다. 배경영상 촬영 시점은 드론 관측 날짜와 다를 수 있습니다.

## 라이브러리

OpenLayers 10.11.0 및 해당 버전이 요구하는 GeoTIFF.js 3.1.0-beta.0을 `vendor/`에 포함했습니다. 각 라이선스 파일을 함께 유지합니다.
