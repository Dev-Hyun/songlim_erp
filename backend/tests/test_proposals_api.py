"""제안서 API — 치료장비 품목 관리·사진 처리, 제안서 CRUD·복사·권한·스냅샷·미리보기·PDF."""
import io

import pytest
from PIL import Image

from app.models import User
from app.security import hash_password

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _tmp_upload_dir(tmp_path, monkeypatch):
    """사진 업로드 테스트가 실제 backend/uploads 폴더에 파일을 남기지 않게 임시 폴더로 돌린다."""
    import app.routers.proposals as r

    monkeypatch.setattr(r, "UPLOAD_DIR", tmp_path / "proposal_therapy")


async def _login(client, db_session, username: str, role: str = "songrim", is_admin: bool = False):
    db_session.add(User(username=username, password_hash=hash_password("pw1234"), display_name=username,
                        role=role, is_admin=is_admin, is_approved=True))
    await db_session.commit()
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw1234"})
    assert res.status_code == 200, res.text
    return {"session_token": res.cookies["session_token"]}


async def _item(client, cookies, name="I.C.T", **kw):
    res = await client.post("/api/proposals/therapy-items", cookies=cookies,
                            json={"name": name, "maker": "탑메드", "model": "TM-301", "note": "1) 컵\n2) **패드**",
                                  "warranty": "2년", **kw})
    assert res.status_code == 200, res.text
    return res.json()


def _payload(**items):
    return {"hospital_name": "세종드림내과의원", "doctor_name": "김민수", "proposal_date": "2026-11-07",
            "rep_name": "이정호", "rep_title": "상무", "rep_phone": "010-6426-7469", "design": "A",
            "items": items}


def _png(color=(30, 60, 200), bg=(255, 255, 255), size=(1200, 900)) -> bytes:
    img = Image.new("RGB", size, bg)
    img.paste(Image.new("RGB", (400, 300), color), (400, 300))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


# ---------- 치료장비 품목 ----------
async def test_therapy_item_crud_reorder_and_hide(client, db_session):
    c = await _login(client, db_session, "tp_staff1")
    a = await _item(client, c, "품목A")
    b = await _item(client, c, "품목B")
    assert b["sort_order"] == a["sort_order"] + 1

    res = await client.put(f"/api/proposals/therapy-items/{a['id']}", cookies=c,
                           json={"name": "품목A2", "maker": "", "model": "M", "note": None, "warranty": "1년", "is_active": True})
    assert res.status_code == 200 and res.json()["name"] == "품목A2" and res.json()["maker"] is None

    res = await client.post("/api/proposals/therapy-items/reorder", cookies=c, json={"ids": [b["id"], a["id"]]})
    assert res.status_code == 200
    names = [r["name"] for r in (await client.get("/api/proposals/therapy-items", cookies=c)).json()]
    assert names.index("품목B") < names.index("품목A2")

    await client.put(f"/api/proposals/therapy-items/{b['id']}", cookies=c, json={"name": "품목B", "is_active": False})
    active = [r["id"] for r in (await client.get("/api/proposals/therapy-items", cookies=c)).json()]
    every = [r["id"] for r in (await client.get("/api/proposals/therapy-items?include_inactive=true", cookies=c)).json()]
    assert b["id"] not in active and b["id"] in every


async def test_therapy_image_upload_removes_white_background(client, db_session):
    c = await _login(client, db_session, "tp_staff2")
    it = await _item(client, c)
    res = await client.post(f"/api/proposals/therapy-items/{it['id']}/image", cookies=c,
                            files={"file": ("p.png", _png(), "image/png")})
    assert res.status_code == 200, res.text
    url = res.json()["image_url"]
    assert url.startswith("/api/proposals/therapy-image/")
    img = Image.open(io.BytesIO((await client.get(url)).content))
    assert img.mode == "RGBA" and max(img.size) <= 800
    assert img.size == (400, 300)  # 흰 배경이 잘려 나가고 파란 상자만 남는다
    assert img.getpixel((200, 150))[3] == 255

    bad = await client.post(f"/api/proposals/therapy-items/{it['id']}/image", cookies=c,
                            files={"file": ("x.png", b"not an image", "image/png")})
    assert bad.status_code == 422


async def test_hospital_account_is_blocked(client, db_session):
    c = await _login(client, db_session, "tp_hosp1", role="hospital")
    assert (await client.get("/api/proposals/therapy-items", cookies=c)).status_code == 403
    assert (await client.get("/api/proposals", cookies=c)).status_code == 403


# ---------- 제안서 ----------
async def test_create_get_update_list_and_search(client, db_session):
    c = await _login(client, db_session, "pp_staff1")
    res = await client.post("/api/proposals", cookies=c, json=_payload(
        mammo=[{"model": "AIDIA VOLVE", "price": 55000000}], carm=[{"model": "OSCAR 15", "price": 85000000}]))
    assert res.status_code == 200, res.text
    p = res.json()
    assert p["summary"] == "C-ARM 1 · MAMMO 1" and p["author_name"] == "pp_staff1"

    upd = _payload(mammo=[{"model": "AIDIA VOLVE", "price": 52000000}])
    upd["design"] = "C"
    res = await client.put(f"/api/proposals/{p['id']}", cookies=c, json=upd)
    assert res.status_code == 200 and res.json()["design"] == "C"
    got = (await client.get(f"/api/proposals/{p['id']}", cookies=c)).json()
    assert got["items"]["mammo"][0]["price"] == 52000000

    rows = (await client.get("/api/proposals?q=세종드림", cookies=c)).json()
    assert any(r["id"] == p["id"] for r in rows) and "items" not in rows[0]
    assert all(r["id"] != p["id"] for r in (await client.get("/api/proposals?q=없는병원", cookies=c)).json())


async def test_invalid_items_rejected(client, db_session):
    c = await _login(client, db_session, "pp_staff2")
    res = await client.post("/api/proposals", cookies=c, json=_payload(xray=[{"model": "GXR-52SD", "price": 1}]))
    assert res.status_code == 422 and "Detector" in str(res.json()["detail"])
    res = await client.post("/api/proposals", cookies=c, json=_payload(therapy=[{"item_id": 999999, "unit_price": 1}]))
    assert res.status_code == 422


async def test_delete_only_author_or_admin(client, db_session):
    a = await _login(client, db_session, "pp_author")
    o = await _login(client, db_session, "pp_other")
    adm = await _login(client, db_session, "pp_admin", is_admin=True)
    p1 = (await client.post("/api/proposals", cookies=a, json=_payload())).json()
    p2 = (await client.post("/api/proposals", cookies=a, json=_payload())).json()
    assert (await client.delete(f"/api/proposals/{p1['id']}", cookies=o)).status_code == 403
    assert (await client.delete(f"/api/proposals/{p1['id']}", cookies=a)).status_code == 200
    assert (await client.delete(f"/api/proposals/{p2['id']}", cookies=adm)).status_code == 200
    assert (await client.get(f"/api/proposals/{p1['id']}", cookies=a)).status_code == 404


async def test_therapy_snapshot_kept_and_copy_refreshes(client, db_session):
    c = await _login(client, db_session, "pp_staff3")
    it = await _item(client, c, "견인 치료기")
    p = (await client.post("/api/proposals", cookies=c, json=_payload(
        therapy=[{"item_id": it["id"], "unit_price": 3900000, "qty": 2}]))).json()
    assert p["items"]["therapy"][0]["snapshot"]["name"] == "견인 치료기"

    await client.put(f"/api/proposals/therapy-items/{it['id']}", cookies=c, json={"name": "견인치료기 신형"})
    again = (await client.get(f"/api/proposals/{p['id']}", cookies=c)).json()
    assert again["items"]["therapy"][0]["snapshot"]["name"] == "견인 치료기"  # 이미 만든 제안서는 그대로

    # 수정 저장해도 기존 스냅샷 유지
    await client.put(f"/api/proposals/{p['id']}", cookies=c, json={**_payload(), "items": again["items"]})
    assert (await client.get(f"/api/proposals/{p['id']}", cookies=c)).json()["items"]["therapy"][0]["snapshot"]["name"] == "견인 치료기"

    cp = (await client.post(f"/api/proposals/{p['id']}/copy", cookies=c)).json()
    assert cp["id"] != p["id"] and cp["copied_from_id"] == p["id"]
    assert cp["items"]["therapy"][0]["snapshot"]["name"] == "견인치료기 신형"
    from datetime import date
    assert cp["proposal_date"] == date.today().isoformat()


async def test_catalog_and_preview(client, db_session):
    c = await _login(client, db_session, "pp_staff4")
    it = await _item(client, c, "파라핀")
    cat = (await client.get("/api/proposals/catalog", cookies=c)).json()
    assert any(x["model"] == "GXR-82SD" for x in cat["xray"])
    assert any(x["id"] == it["id"] for x in cat["therapy"])

    res = await client.post("/api/proposals/preview", cookies=c, json=_payload(
        xray=[{"model": "GXR-E40S Plus", "detector_count": 2, "price": 28980000}],
        therapy=[{"item_id": it["id"], "unit_price": 77000, "qty": 1}]))
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/html")
    html = res.text
    assert html.count('class="sheet dA') == 6  # 표지·소개·X-ray·치료장비·함께 하는 이유·마지막 장
    assert '<b class="hl">2EA</b>' in html and "/api/proposals/static/img/e40s.png" in html


async def test_static_photo_served_and_traversal_blocked(client):
    assert (await client.get("/api/proposals/static/img/sd.png")).status_code == 200
    # httpx가 '..'를 미리 정리하지 않도록 인코딩해서 보낸다 → 서버가 static 밖 경로를 막아야 한다
    assert (await client.get("/api/proposals/static/%2e%2e/render.py")).status_code == 404


async def test_pdf_download(client, db_session):
    pytest.importorskip("playwright")
    c = await _login(client, db_session, "pp_staff5")
    p = (await client.post("/api/proposals", cookies=c, json=_payload(
        bmd=[{"model": "PRIMUS", "price": 44000000}]))).json()
    from app.proposal.pdf import shutdown

    try:
        res = await client.get(f"/api/proposals/{p['id']}/pdf", cookies=c)
    finally:
        await shutdown()  # 이 테스트의 이벤트 루프가 닫히기 전에 Chromium 정리
    if res.status_code == 503:
        pytest.skip("Chromium을 띄울 수 없는 환경")
    assert res.status_code == 200
    assert res.content[:4] == b"%PDF"
    assert "filename*=UTF-8''2026-11-07_" in res.headers["content-disposition"]


async def test_last_saved_price_becomes_default(client, db_session):
    c = await _login(client, db_session, "pp_staff6")
    o = await _login(client, db_session, "pp_staff7")
    cat = (await client.get("/api/proposals/catalog", cookies=c)).json()
    # 처음 기본값 = 기존 제안서 금액
    assert cat["defaults"]["xray:GXR-E40S Plus"]["price"] == 28180000
    assert cat["defaults"]["emg:Keypoint Focus Elite (Synergy)"]["price"] == 25000000
    assert any(x["model"] == "Keypoint Focus Elite (Synergy)" for x in cat["emg"])

    it = await _item(client, c, "자기장 치료기")
    await client.post("/api/proposals", cookies=c, json=_payload(
        xray=[{"model": "GXR-E40S Plus", "price": 27000000, "options": [{"key": "capacitor", "price": 2400000}]}],
        therapy=[{"item_id": it["id"], "unit_price": 4300000, "qty": 2}]))
    # 다른 사람이 만들어도 마지막 금액이 기본값
    d = (await client.get("/api/proposals/catalog", cookies=o)).json()["defaults"]
    assert d["xray:GXR-E40S Plus"]["price"] == 27000000
    assert d["xray_opt:capacitor"]["price"] == 2400000
    assert d[f"therapy:{it['id']}"] == {"price": 4300000, "qty": 2}

    p = (await client.post("/api/proposals", cookies=o, json=_payload(
        xray=[{"model": "GXR-E40S Plus", "price": 26500000}]))).json()
    await client.put(f"/api/proposals/{p['id']}", cookies=o, json=_payload(xray=[{"model": "GXR-E40S Plus", "price": 26000000}]))
    d = (await client.get("/api/proposals/catalog", cookies=c)).json()["defaults"]
    assert d["xray:GXR-E40S Plus"]["price"] == 26000000
