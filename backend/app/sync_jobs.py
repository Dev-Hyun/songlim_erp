"""외부 공공데이터 정기 동기화 작업.

왜 생겼나: 의료기관 개설현황(행안부)은 **자동 갱신이 아예 없었다.** 2026-09-20에 손으로
한 번 적재한 뒤로 그대로라, 화면의 기준일이 09-18에 멈춰 사용자가 "18일 이후가 안 보인다"고
신고했다. 입찰·의료소식만 스케줄러에 있었고 나머지 공공데이터는 전부 수동이었다.

설계 메모:
- 수집 스크립트는 blocking requests + sqlite3 로 도는 독립 실행 파일이다. 이벤트 루프에서
  직접 돌리면 API 전체가 멈추므로 **서브프로세스**로 띄운다(메모리·크래시도 격리된다).
- 2026-09-24에 디스크가 꽉 차 서버의 모든 쓰기가 멈춘 적이 있다. 그래서 동기화 전에
  여유 공간을 확인하고, 모자라면 **받지 않고 건너뛴다** — 꽉 찬 디스크에 더 쓰는 게
  제일 나쁘다.
- 어떤 실패도 스케줄러를 죽이지 않는다. 다음 주기에 다시 시도하면 되고, 수집 스크립트는
  전부 멱등(UPSERT)이라 중복 적재가 되지 않는다.
"""
import asyncio
import os
import shutil

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BACKEND_DIR, "scripts")
DB_PATH = os.path.join(BACKEND_DIR, "data.db")

# 수집 중 DB가 커질 수 있으므로 이만큼은 남아 있어야 시작한다.
# 전부 UPSERT라 증가량은 크지 않지만(롤백 저널 + 신규 행), 2026-09-24처럼 꽉 찬 디스크에
# 더 쓰는 상황만은 피한다.
MIN_FREE_BYTES = 1024 * 1024 * 1024  # 1GB
# 한 스크립트가 이보다 오래 걸리면 매달린 것으로 보고 끊는다.
SCRIPT_TIMEOUT = 60 * 60  # 1시간


def _free_bytes() -> int:
    return shutil.disk_usage(BACKEND_DIR).free


async def _run_script(script: str, *args: str) -> bool:
    """수집 스크립트를 서브프로세스로 실행. 성공 여부만 돌려준다."""
    path = os.path.join(SCRIPTS_DIR, script)
    if not os.path.exists(path):
        print(f"[sync] 스크립트 없음, 건너뜀: {script}")
        return False

    free = _free_bytes()
    if free < MIN_FREE_BYTES:
        print(f"[sync] 디스크 여유 부족({free // 1048576}MB) — {script} 건너뜀")
        return False

    cmd = ["python", path, *args]
    print(f"[sync] 시작: {script} {' '.join(args)}")
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=BACKEND_DIR,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=SCRIPT_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            print(f"[sync] 시간 초과({SCRIPT_TIMEOUT}s)로 중단: {script}")
            return False
    except Exception as e:  # 스케줄러는 어떤 경우에도 죽지 않는다
        print(f"[sync] 실행 실패: {script} — {e}")
        return False

    tail = (out or b"").decode("utf-8", "replace").strip().splitlines()[-3:]
    for line in tail:
        print(f"[sync]   {line}")
    ok = proc.returncode == 0
    print(f"[sync] {'완료' if ok else '실패(코드 %s)' % proc.returncode}: {script}")
    return ok


async def sync_openings_job():
    """의료기관 개설현황(행안부 지방행정 인허가) — 매일.

    원문 API에 증분 조회가 없어 매번 전체를 훑는다(의원 약 1,258페이지). mng_no UPSERT라
    멱등하고, 페이지 단위로 커밋해 중간에 끊겨도 다음 실행에서 채워진다.
    """
    for category in ("clinics", "hospitals"):
        await _run_script("sync_localdata_clinics.py", "--apply", "--category", category)


async def sync_hira_hospitals_job():
    """심평원 병원정보 — 주 1회.

    개설현황과 달리 기관 원장 정보라 하루 단위로 바뀌지 않는다. 89,000여 건을 매일 훑을
    이유가 없어 주간으로 둔다.
    """
    await _run_script("sync_hira_hospital_info.py", "--apply")
