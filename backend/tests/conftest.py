"""테스트용 격리된 SQLite DB + FastAPI 앱을 준비하는 공용 fixture.
실제 backend/data.db는 절대 건드리지 않고, 테스트 세션마다 임시 DB 파일을 새로 만든다."""
import os
import tempfile

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

TEST_DB_FD, TEST_DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(TEST_DB_FD)
os.environ["DB_PATH"] = TEST_DB_PATH


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _prepare_schema():
    from app.database import DATABASE_URL
    from app.models import Base

    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    yield
    try:
        os.remove(TEST_DB_PATH)
    except OSError:
        pass


@pytest_asyncio.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    from app.database import DATABASE_URL

    engine = create_async_engine(DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()
