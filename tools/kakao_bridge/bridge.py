"""송림 ERP → 카카오톡 단톡방 알림 브리지 (사내 PC에서 실행).

동작: ERP 서버의 대기열을 주기적으로 폴링 → 카카오톡 PC 클라이언트의 해당 채팅방 창을
찾아 메시지를 입력하고 엔터 → 결과를 서버에 되돌려준다.

서버가 이 PC로 접속하지 않고 PC가 서버로 나가서 가져오는 구조라, 사내망에 포트를
열 필요가 없다.

⚠️ 주의 (반드시 읽을 것)
  - 카카오톡 약관은 자동화 도구 사용을 금지한다. 이 방식은 계정 제재 가능성이 있다.
    가능하면 업무 전용 계정으로 운영하고, 개인 계정으로 돌리지 말 것.
  - 카카오톡 업데이트로 창 구조가 바뀌면 동작이 깨질 수 있다. 실패는 서버에 기록되므로
    ERP에서 확인할 수 있다.
  - PC가 켜져 있고 카카오톡에 로그인되어 있어야 한다. 화면 잠금 상태에서는 창 제어가
    실패할 수 있으니 잠금 해제 상태로 두거나 화면보호기를 끄는 것을 권장.

설치:
    pip install pywinauto requests

실행:
    set ERP_BASE=https://songlim-medical.com
    set KAKAO_BRIDGE_TOKEN=<서버 .env와 동일한 값>
    set KAKAO_ROOM=송림메디칼 단톡방          # 채팅방 이름 정확히
    python bridge.py

윈도우 시작 시 자동 실행하려면 run_bridge.bat 을 시작 프로그램 폴더에 넣으면 된다
(Win+R → shell:startup).
"""
import os
import sys
import time
import traceback

import requests

ERP_BASE = os.environ.get("ERP_BASE", "https://songlim-medical.com").rstrip("/")
TOKEN = os.environ.get("KAKAO_BRIDGE_TOKEN", "")
ROOM = os.environ.get("KAKAO_ROOM", "")
POLL_SEC = int(os.environ.get("KAKAO_POLL_SEC", "20"))
DRY_RUN = os.environ.get("KAKAO_DRY_RUN", "").lower() in ("1", "true", "yes")

HEADERS = {"X-Bridge-Token": TOKEN}


def log(msg: str) -> None:
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def send_to_kakao(text: str) -> None:
    """카카오톡 채팅방 창을 찾아 메시지를 보낸다.

    카카오톡은 채팅방을 별도 최상위 창으로 띄우며 창 제목이 채팅방 이름이다.
    창이 닫혀 있으면 사용자가 한 번 열어둬야 한다(자동으로 열려면 메인 창의 목록을
    더블클릭해야 하는데, 목록 렌더링이 커스텀이라 안정적이지 않다).
    """
    if DRY_RUN:
        log(f"[DRY_RUN] 보낼 내용:\n{text}")
        return

    from pywinauto import Application  # 지연 import — DRY_RUN 테스트는 윈도우 밖에서도 가능

    app = Application(backend="win32").connect(title=ROOM, timeout=10)
    win = app.window(title=ROOM)
    win.set_focus()

    # 카카오톡 입력창은 RichEdit 계열. 줄바꿈은 Shift+Enter 로 넣어야 전송되지 않는다.
    edit = win.child_window(class_name="RICHEDIT50W", found_index=0)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        edit.type_keys(line, with_spaces=True, with_newlines=False, set_foreground=False)
        if i < len(lines) - 1:
            edit.type_keys("+{ENTER}", set_foreground=False)  # Shift+Enter = 줄바꿈
    edit.type_keys("{ENTER}", set_foreground=False)  # 전송


def report(outbox_id: int, ok: bool, error: str = "") -> None:
    try:
        requests.post(
            f"{ERP_BASE}/api/kakao-bridge/{outbox_id}/result",
            json={"ok": ok, "error": error},
            headers=HEADERS, timeout=10,
        ).raise_for_status()
    except Exception as e:  # noqa: BLE001
        log(f"결과 보고 실패 (id={outbox_id}): {e}")


def poll_once() -> int:
    r = requests.get(f"{ERP_BASE}/api/kakao-bridge/pending", headers=HEADERS, timeout=15)
    if r.status_code == 503:
        log("서버에 KAKAO_BRIDGE_TOKEN이 설정되지 않았습니다. 서버 .env를 확인하세요.")
        return 0
    if r.status_code == 401:
        log("브리지 토큰 불일치. 서버 .env의 KAKAO_BRIDGE_TOKEN과 같은 값인지 확인하세요.")
        return 0
    r.raise_for_status()
    items = r.json()
    for item in items:
        try:
            send_to_kakao(item["text"])
            report(item["id"], True)
            log(f"전송 완료 (id={item['id']}, kind={item['kind']})")
        except Exception as e:  # noqa: BLE001
            report(item["id"], False, f"{type(e).__name__}: {e}")
            log(f"전송 실패 (id={item['id']}): {type(e).__name__}: {e}")
        time.sleep(1)  # 연속 전송 시 카톡이 놓치지 않도록 간격
    return len(items)


def main() -> int:
    if not TOKEN:
        log("환경변수 KAKAO_BRIDGE_TOKEN 이 필요합니다.")
        return 1
    if not ROOM and not DRY_RUN:
        log("환경변수 KAKAO_ROOM (채팅방 이름) 이 필요합니다.")
        return 1
    log(f"브리지 시작 — 서버={ERP_BASE}, 채팅방='{ROOM}', 주기={POLL_SEC}초, DRY_RUN={DRY_RUN}")
    while True:
        try:
            poll_once()
        except KeyboardInterrupt:
            log("종료합니다.")
            return 0
        except Exception:  # noqa: BLE001 — 네트워크 끊김 등으로 죽지 않게
            log("폴링 중 오류:\n" + traceback.format_exc())
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    sys.exit(main())
