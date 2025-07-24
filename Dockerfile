# --- Fase 1: Builder ---
# Usiamo un'immagine Python completa per installare le dipendenze
FROM python:3.11-slim AS builder

WORKDIR /usr/src/app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /usr/src/app/wheels -r requirements.txt


# --- Fase 2: Runtime ---
FROM python:3.11-slim

RUN addgroup --system app && adduser --system --group app

WORKDIR /home/app

COPY --from=builder /usr/src/app/wheels /wheels
COPY --from=builder /usr/src/app/requirements.txt .

RUN pip install --no-cache /wheels/*

COPY ./app /home/app/app

RUN mkdir -p /home/app/data && chmod 777 /home/app/data

RUN chown -R app:app /home/app

USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
