from fastapi import FastAPI
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

# ✅ Base + Data directory (correct)
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
def submit_code(request: CodeSubmission):
    if not request.code:
        return {"error": "Code cannot be empty"}

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
    queue.enqueue("worker.execute_code", {"job_id": job_id, "code": request.code},  retry=Retry(max=3, interval=[5, 10, 20]))
    return {
        "job_id": job_id,
        "status": "queued"
    }

    
@app.get("/job-status/{job_id}")
def job_status(job_id: str):
    job_data = redis_conn.get(job_id)

    if not job_data:
        return {"error": "Job not found"}

    # ✅ Convert bytes → string → dict
    job = json.loads(job_data.decode("utf-8"))

    return {
        "job_id": job_id,
        "status": job["status"],
        "output": job["output"],
        "error": job["error"]
    }