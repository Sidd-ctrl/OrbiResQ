FROM node:26-alpine AS client-build
RUN echo "os-refresh 2026-11-21" && apk upgrade --no-cache
WORKDIR /build
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

FROM python:3-alpine
RUN echo "os-refresh 2026-11-21" && apk upgrade --no-cache && apk add --no-cache bash
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    DATA_DIR=/app/data \
    DATABASE_URL=sqlite:////app/data/orbi_resq.db
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server ./server
COPY cv_service ./cv_service
COPY scripts ./scripts
COPY --from=client-build /build/dist ./client/dist
RUN mkdir -p /app/data/datasets \
    && adduser -D -u 10001 appjet \
    && chown -R appjet:appjet /app
USER appjet
EXPOSE 3000
CMD ["bash", "scripts/start.sh"]
