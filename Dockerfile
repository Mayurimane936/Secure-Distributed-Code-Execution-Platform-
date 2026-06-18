FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

# Copy startup script
COPY start.sh /app/start.sh

# Make it executable
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]