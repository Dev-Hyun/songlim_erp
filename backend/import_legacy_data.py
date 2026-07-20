"""레거시 backend/data.db(심평원 실데이터, 59,253개 병원 + 375,816건 장비이력)를
SONGLIM_ERP 신규 스키마(hospitals/equipment)로 실데이터 이전.
카테고리 매핑: 레거시 'xr' -> 신규 'xray' (us는 동일). ct/mri는 레거시에 데이터가 없어 비어있음(수동등록 대상)."""
import os
import sqlite3
from datetime import datetime, timezone

NEW_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.db")
LEGACY_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backend", "data.db",
)

now = datetime.now(timezone.utc).isoformat()

conn = sqlite3.connect(NEW_DB)
conn.execute("ATTACH DATABASE ? AS legacy", (LEGACY_DB,))

conn.execute("DELETE FROM equipment")
conn.execute("DELETE FROM hospitals")

conn.execute(
    """
    INSERT INTO hospitals (id, name, name_norm, type, sido, sigungu, address, lat, lng, ykiho, hospital_profile_id, created_at, updated_at)
    SELECT id, name, name_norm, type, sido, sigungu, NULL, lat, lng, ykiho, NULL, ?, ?
    FROM legacy.hospitals
    """,
    (now, now),
)

conn.execute(
    """
    INSERT INTO equipment (id, hospital_id, category, year, manufacturer, model, eq_count, source, created_by)
    SELECT id, hospital_id, CASE category WHEN 'xr' THEN 'xray' ELSE category END,
           year, manufacturer, model, COALESCE(eq_count, 1), 'import', NULL
    FROM legacy.equipment_yearly
    """
)

conn.commit()

h_count = conn.execute("SELECT COUNT(*) FROM hospitals").fetchone()[0]
e_count = conn.execute("SELECT COUNT(*) FROM equipment").fetchone()[0]
print(f"imported hospitals={h_count} equipment={e_count}")

conn.close()
