from typing import Optional
from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class MileageLog(Base):
    """운행일지 — 국세청 운행기록부 양식 대응."""
    __tablename__ = "mileage_logs"
    __table_args__ = (Index("idx_mileage_user_date", "user_id", "log_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    log_date: Mapped[str] = mapped_column()
    final_km: Mapped[float] = mapped_column()
    prev_km: Mapped[float] = mapped_column(default=0)
    daily_km: Mapped[float] = mapped_column(default=0)
    nonbiz_km: Mapped[float] = mapped_column(default=0)  # 비업무용 사용거리 — 국세청 운행기록부 양식 대응
    purpose: Mapped[Optional[str]] = mapped_column(default="")
    note: Mapped[Optional[str]] = mapped_column(default="")
    vehicle: Mapped[Optional[str]] = mapped_column(default="")
    created_at: Mapped[str] = mapped_column()


class Bid(Base):
    """입찰정보 — 나라장터(G2B) API + 국방전자조달(D2B) 자동수집, 레거시와 동일한 스키마/로직."""
    __tablename__ = "bids"

    id: Mapped[int] = mapped_column(primary_key=True)
    bid_no: Mapped[str] = mapped_column(unique=True)
    source: Mapped[Optional[str]] = mapped_column(default=None)  # G2B | D2B
    title: Mapped[str] = mapped_column()
    agency: Mapped[Optional[str]] = mapped_column(default=None)
    budget: Mapped[Optional[str]] = mapped_column(default=None)
    start_date: Mapped[Optional[str]] = mapped_column(default=None)
    end_date: Mapped[Optional[str]] = mapped_column(default=None)
    url: Mapped[Optional[str]] = mapped_column(default=None)
    files_json: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column()


class NewsArticle(Base):
    """의료소식 — MedicalTimes(Google News RSS) + 의협신문(홈페이지 인기기사) 자동수집, 레거시와 동일."""
    __tablename__ = "news_articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    url_hash: Mapped[Optional[str]] = mapped_column(default=None, unique=True)
    title: Mapped[str] = mapped_column()
    link: Mapped[Optional[str]] = mapped_column(default=None)
    source: Mapped[Optional[str]] = mapped_column(default=None)
    thumbnail: Mapped[Optional[str]] = mapped_column(default=None)
    rank: Mapped[int] = mapped_column(default=99)
    created_at: Mapped[str] = mapped_column()


class StorageFile(Base):
    """클라우드 NAS / 사내 문서 서식 자료실. folder_path 단위로 storage_folder_permissions와 연동."""
    __tablename__ = "storage_files"
    __table_args__ = (Index("idx_storage_folder", "folder_path"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_path: Mapped[str] = mapped_column()
    filename: Mapped[str] = mapped_column()
    file_key: Mapped[str] = mapped_column()
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column()
