from fastapi import FastAPI, Request
from pydantic import BaseModel
import uuid
import os
import subprocess
from rq import Queue, Retry
from redis import Redis
from worker import execute_code
import json

app = FastAPI()
redis_conn = Redis()
queue = Queue(connection=redis_conn)

class CodeSubmission(BaseModel):
    code: str

jobs = {}

# Base + Data directory (correct)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

def store_code_to_file(code, job_id):
    os.makedirs(DATA_DIR, exist_ok=True)
    file_path = os.path.join(DATA_DIR, f"{job_id}_usercode.py")
    with open(file_path, "w") as f:
        f.write(code)
    return file_path


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
    
    if request_count>10:
        return {
            "error": "Rate limit exceeded. Try again later"
        }
        print(f"Rate limit exceeded for {client_ip}")
    if not request_data.code:
        return {"error": "Code cannot be empty"}

    if running_jobs>=2:
        return {
            "error": "Concurrency limit exceeded. Max 2 running jobs per user."
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
    queue.enqueue("worker.execute_code", {"job_id": job_id, "code": request_data.code, "user_ip":client_ip},  retry=Retry(max=3, interval=[5, 10, 20]))
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