#!/bin/sh

python -m app.worker.worker &

uvicorn app.main:app --host 0.0.0.0 --port 8000