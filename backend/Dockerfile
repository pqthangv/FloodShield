FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set DATABASE_URL to a PostgreSQL database in production (photos are stored in it too).
# Without it a local SQLite file is used, which is lost when the container is replaced.
ENV DATABASE_URL=sqlite+aiosqlite:///./store.db

EXPOSE 8000

# Most hosts (Render, Railway, Fly.io, Koyeb) pass the port in $PORT.
# --no-access-log: request lines contain users' coordinates (?lat=&lon=), and the privacy policy
# promises no location history. Errors and warnings are still logged; see /health?upstream=1.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --no-access-log"]
