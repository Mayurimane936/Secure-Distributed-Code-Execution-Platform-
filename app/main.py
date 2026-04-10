from fastapi import FastAPI, Request
from pydantic import BaseModel
import uuid
import os
import subprocess
from rq import Queue, Retry
from redis import Redis
from worker import execute_code
import json
from api.dashboard import router as dashboard_router
from utils import store_code_to_file
from env_config.config import Config

config = Config()
app = FastAPI()
redis_conn = Redis(host=config.redis_host, port=config.redis_port, db=config.redis_db)
queue = Queue(config.rq_queue_name, connection=redis_conn)

class CodeSubmission(BaseModel):
    code: str

jobs = {}


@app.get("/")
def home():
    return {"message": "Secure Code Execution Platform 🚀"}

@app.post("/submit-code")
def submit_code(request_data: CodeSubmission, request: Request):
    # rate limiting per client IP
    client_ip = request.client.host
    rate_key = f"rate_limit:{client_ip}"
    request_count = redis_conn.incr(rate_key)

    # concurrency limit per IP
    user_job_key = f"user_jobs:{client_ip}"

    running_jobs = redis_conn.get(user_job_key)
    running_jobs = int(running_jobs) if running_jobs else 0

    if request_count == 1:
        redis_conn.expire(rate_key, 60)
    
    if request_count > config.rate_limit_per_minute:
        return {
            "error": "Rate limit exceeded. Try again later"
        }
        print(f"Rate limit exceeded for {client_ip}")
    if not request_data.code:
        return {"error": "Code cannot be empty"}

    if running_jobs >= config.max_concurrent_jobs:
        return {
            "error": f"Concurrency limit exceeded. Max {config.max_concurrent_jobs} running jobs per user."
        }
        print(f"Concurrency limit exceeded for {client_ip}")


    job_id = str(uuid.uuid4())

    # jobs[job_id] = {
    # "status": "pending",
    # "output": "",
    # "error": ""
    # }

    redis_conn.set(job_id, json.dumps({
    "status": "pending",
    "output": "",
    "error": ""
    }))
    redis_conn.incr(user_job_key)
    queue.enqueue(
        "worker.execute_code",
        {"job_id": job_id, "code": request_data.code, "user_ip": client_ip},
        retry=Retry(max=config.retry_max, interval=config.retry_intervals)
    )
    return {
        "job_id": job_id,
        "status": "queued"
    }

    
@app.get("/job-status/{job_id}")
def job_status(job_id: str):
    job_data = redis_conn.get(job_id)

    if not job_data:
        return {"error": "Job not found"}

    # Convert bytes → string → dict
    job = json.loads(job_data.decode("utf-8"))

    return {
        "job_id": job_id,
        "status": job["status"],
        "output": job["output"],
        "error": job["error"],
        "execution_time": job.get("execution_time", None),
        "container_name": job.get("container_name", None),
        "exit_reason": job.get("exit_reason", None),
        "timestamp": job.get("timestamp", None)
    }


@app.get("/health/workers")
def worker_health():
    worker_keys = redis_conn.keys("worker:*")
    workers = []
    for key in worker_keys:
        worker_id = key.decode().split(":")[1]
        last_seen = int(redis_conn.get(key))

        workers.append({
            "worker_id": worker_id,
            "last_seen": last_seen,
            "status": "alive"
        })
    return {
        "workers_active": len(workers),
        "workers": workers
    }

app.include_router(dashboard_router)
