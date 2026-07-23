"""신규(빈) 배포 DB에 최초 관리자 계정 + 등급표 기본값을 심는다. 이미 데이터가 있으면 아무 것도 하지 않는다.

사용법 (컨테이너/서버에서 1회):
    INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD=바꿔주세요 INITIAL_ADMIN_NAME=관리자 \
    python seed_production.py
"""
import asyncio
import os
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import GradeMaster, StaffProfile, User
from app.security import hash_password


async def main():
    username = os.environ.get("INITIAL_ADMIN_USERNAME")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD")
    display_name = os.environ.get("INITIAL_ADMIN_NAME", "관리자")

    async with AsyncSessionLocal() as db:
        existing_admin = (await db.execute(select(User).where(User.role == "songrim"))).scalars().first()
        if existing_admin:
            print(f"이미 송림 직원 계정이 존재합니다 ({existing_admin.username}) — 관리자 시딩 건너뜀")
        elif not username or not password:
            print("INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD 환경변수가 없어 관리자 계정을 만들지 않았습니다")
        else:
            now = datetime.now(timezone.utc)
            user = User(
                username=username, password_hash=hash_password(password),
                display_name=display_name, role="songrim", is_admin=True,
                created_at=now, updated_at=now,
            )
            db.add(user)
            await db.flush()
            db.add(StaffProfile(user_id=user.id, department="관리팀", position="관리자",
                                 created_at=now, updated_at=now))
            await db.commit()
            print(f"관리자 계정 생성 완료: {username}")

        existing_grades = (await db.execute(select(GradeMaster))).scalars().first()
        if existing_grades:
            print("grade_master에 이미 데이터가 있어 건너뜀")
        else:
            db.add(GradeMaster(grade_code="A", grade_type="discount", label="A등급 (일반 거래처)", discount_rate=5.0, sort_order=0))
            db.add(GradeMaster(grade_code="VIP", grade_type="discount", label="VIP 등급", discount_rate=10.0, sort_order=1))
            await db.commit()
            print("grade_master 기본값(A/VIP) 생성 완료 — 관리자 화면에서 자유롭게 수정/추가 가능")


if __name__ == "__main__":
    asyncio.run(main())
