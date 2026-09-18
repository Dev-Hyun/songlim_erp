@echo off
REM 송림 ERP 카카오톡 브리지 — 사내 PC에서 실행. 시작 프로그램에 넣어두면 부팅 시 자동 실행.
REM Win+R → shell:startup → 이 파일의 바로가기를 넣으세요.

set ERP_BASE=https://songlim-medical.com
set KAKAO_BRIDGE_TOKEN=여기에_서버와_동일한_토큰
set KAKAO_ROOM=여기에_단톡방_이름_정확히
set KAKAO_POLL_SEC=20

cd /d "%~dp0"
python bridge.py
pause
