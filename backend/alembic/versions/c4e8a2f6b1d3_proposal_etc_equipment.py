"""제안서 기타장비 정리 — 치료장비의 ESWT 품목 제거, 두타메트 모델명, 근전도 모델명

1) 치료장비 품목 중 품명 'ESWT'는 '기타장비 → ESWT'로 옮겨 갔으므로 지운다.
   이미 저장된 제안서가 쓰고 있는 품목은 지우지 않고 '사용 안 함'으로만 둔다(복사할 때 품목을 다시 읽기 때문).
   지운 품목의 마지막 금액(therapy:<id>)도 지운다.
2) 두타메트 모델명 OK-1 → OKB-01.
3) 근전도 모델명 'Keypoint Focus Elite (Synergy)' → 'Keypoint Focus'(장비 = Keypoint Focus, SW = Elite).
   저장된 제안서 items와 마지막 금액 키도 같이 바꾼다.
4) 받는 분(doctor_name)에 직함까지 직접 적게 바뀌어(원장님·실장님·대학교 등) PDF가 더는 '원장님'을 붙이지 않는다.
   이미 저장된 제안서 중 사람 이름만 적힌 것(한글 2~4자, '장'으로 끝나지 않음 — 예: 이태경)은 이전처럼 보이도록
   ' 원장님'을 붙인다. 직함까지 적은 것(예: 방사선실장)은 그대로 둔다.

Revision ID: c4e8a2f6b1d3
Revises: a7c2e9f1b3d4
"""
import json
import re

import sqlalchemy as sa
from alembic import op

revision = "c4e8a2f6b1d3"
down_revision = "a7c2e9f1b3d4"
branch_labels = None
depends_on = None

OLD_EMG = "Keypoint Focus Elite (Synergy)"
NEW_EMG = "Keypoint Focus"


def upgrade():
    conn = op.get_bind()

    # 저장된 제안서: 근전도 모델명 바꾸고, 쓰고 있는 치료장비 품목 id를 모은다
    used: set[int] = set()
    for pid, raw in conn.execute(sa.text("SELECT id, items FROM proposals")).all():
        items = json.loads(raw or "{}")
        used.update(int(t["item_id"]) for t in items.get("therapy", []))
        changed = False
        for r in items.get("emg", []):
            if r.get("model") == OLD_EMG:
                r["model"] = NEW_EMG
                changed = True
        if changed:
            conn.execute(sa.text("UPDATE proposals SET items = :i WHERE id = :id"),
                         {"i": json.dumps(items, ensure_ascii=False), "id": pid})

    eswt = [r[0] for r in conn.execute(sa.text("SELECT id FROM proposal_therapy_items WHERE name = 'ESWT'")).all()]
    for item_id in eswt:
        if item_id in used:
            conn.execute(sa.text("UPDATE proposal_therapy_items SET is_active = 0 WHERE id = :id"), {"id": item_id})
        else:
            conn.execute(sa.text("DELETE FROM proposal_therapy_items WHERE id = :id"), {"id": item_id})
        conn.execute(sa.text("DELETE FROM proposal_last_prices WHERE key = :k"), {"k": f"therapy:{item_id}"})

    conn.execute(sa.text("UPDATE proposal_therapy_items SET model = 'OKB-01' WHERE model = 'OK-1'"))

    for pid, name in conn.execute(sa.text("SELECT id, doctor_name FROM proposals")).all():
        n = (name or "").strip()
        if re.fullmatch(r"[가-힣]{2,4}", n) and not n.endswith("장"):
            conn.execute(sa.text("UPDATE proposals SET doctor_name = :d WHERE id = :id"), {"d": f"{n} 원장님", "id": pid})

    # 근전도 마지막 금액 키: 새 키가 없을 때만 옮긴다
    has_new = conn.execute(sa.text("SELECT 1 FROM proposal_last_prices WHERE key = :k"), {"k": f"emg:{NEW_EMG}"}).first()
    if has_new:
        conn.execute(sa.text("DELETE FROM proposal_last_prices WHERE key = :k"), {"k": f"emg:{OLD_EMG}"})
    else:
        conn.execute(sa.text("UPDATE proposal_last_prices SET key = :n WHERE key = :o"),
                     {"n": f"emg:{NEW_EMG}", "o": f"emg:{OLD_EMG}"})


def downgrade():
    # 지운 ESWT 품목은 되살리지 않는다(필요하면 품목 관리 화면에서 다시 추가).
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE proposal_therapy_items SET model = 'OK-1' WHERE model = 'OKB-01'"))
    conn.execute(sa.text("UPDATE proposals SET doctor_name = substr(doctor_name, 1, length(doctor_name) - 4) "
                         "WHERE doctor_name LIKE '% 원장님'"))
    for pid, raw in conn.execute(sa.text("SELECT id, items FROM proposals")).all():
        items = json.loads(raw or "{}")
        if any(r.get("model") == NEW_EMG for r in items.get("emg", [])):
            for r in items["emg"]:
                if r.get("model") == NEW_EMG:
                    r["model"] = OLD_EMG
            conn.execute(sa.text("UPDATE proposals SET items = :i WHERE id = :id"),
                         {"i": json.dumps(items, ensure_ascii=False), "id": pid})
    conn.execute(sa.text("UPDATE proposal_last_prices SET key = :o WHERE key = :n"),
                 {"n": f"emg:{NEW_EMG}", "o": f"emg:{OLD_EMG}"})
