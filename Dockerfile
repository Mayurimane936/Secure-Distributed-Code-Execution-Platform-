FROM python:3.11

WORKDIR /app

COPY requirements.txt .

RUN apt-get update \
    && apt-get install -y docker.io \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]