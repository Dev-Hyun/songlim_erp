FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 제안서 PDF: Playwright용 Chromium(headless shell)과 시스템 라이브러리, 한글 대체 폰트(Noto CJK).
# 웹폰트(Google Fonts)를 못 받는 상황에서도 한글이 깨지지 않게 한다.
RUN playwright install --with-deps --only-shell chromium     && apt-get install -y --no-install-recommends fonts-noto-cjk     && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8010

CMD ["sh", "-c", "alembic upgrade head && python seed_production.py && uvicorn app.main:app --host 0.0.0.0 --port 8010"]
