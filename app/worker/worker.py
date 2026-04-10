import os
import subprocess
import json
import time
import uuid
import threading
from redis import Redis
from rq import Queue
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from utils import store_code_to_file
# from app.utils import store_code_to_file
import random
from config import Config

config = Config()
containers = config.containers

redis_conn = Redis(host=config.redis_host, port=config.redis_port, db=config.redis_db)
queue = Queue(connection=redis_conn)

# Unique worker ID
worker_id = str(uuid.uuid4())

# -----------------------------
# HEARTBEAT FUNCTION
# -----------------------------
def send_heartbeat():
    while True:
        redis_conn.set(
            f"worker:{worker_id}",
            int(time.time()),
            ex=10  # expires if worker dies
        )
        print(f" Heartbeat from {worker_id}")
        time.sleep(3)

# -----------------------------
# ATOMIC LOCKING
# -----------------------------
def get_free_container():
    while True:
        random.shuffle(containers)
        for c in containers:
            lock_key = f"lock:{c}"

            # Atomic lock
            is_locked = redis_conn.set(
                lock_key,
                worker_id,
                nx=True,
                ex=30
            )

            if is_locked:
                print(f" Locked container {c}")
                return c

        print("Waiting for free container...")
        time.sleep(1)

# -----------------------------
# RELEASE LOCK
# -----------------------------
def release_container(container_name):
    lock_key = f"lock:{container_name}"

    current_owner = redis_conn.get(lock_key)

    if current_owner and current_owner.decode() == worker_id:
        redis_conn.delete(lock_key)
        print(f" Released {container_name}")

# -----------------------------
# MAIN EXECUTION FUNCTION
# -----------------------------
def execute_code(job_data):
    start_time = time.time()
    job_id = job_data["job_id"]
    redis_conn.incr("metrics:jobs_total")
    code = job_data["code"]
    user_ip = job_data["user_ip"]
    user_job_key = f"user_jobs:{user_ip}"

    current_minute = int(time.time() / 60)
    redis_conn.incr(f"metrics:jobs_minute:{current_minute}")

    status = "error"
    output = ""
    error = ""
    exit_reason = "unknown"

    container_name = None  # for safety

    try:
        redis_conn.set(job_id, json.dumps({
            "status": "running",
            "output": "",
            "error": ""
        }))
        # 1️ Lock container
        container_name = get_free_container()

        # 2️ Store code
        file_path = store_code_to_file(code, job_id)
        container_file = f"/tmp/{job_id}.py"

        #  Clean container before use
        cleanup = subprocess.run(
            ["docker", "exec", container_name, "sh", "-c", "rm -f /tmp/*.py"],
            capture_output=True,
            text=True
        )

        if cleanup.returncode != 0:
            print("Container unhealthy. Restarting...")

            subprocess.run(["docker", "restart", container_name])

            time.sleep(1)
            # raise Exception(f"Cleanup failed: {cleanup.stderr}")

        # 3️ Copy file to container
        # cp_result = subprocess.run(
        #     ["docker", "cp", file_path, f"{container_name}:{container_file}"],
        #     capture_output=True,
        #     text=True
        # )
        # 3️ Write file directly inside container (FIXED)
        with open(file_path, "r") as f:
            code_content = f.read()

        write_result = subprocess.run(
            [
                "docker", "exec", "-i", container_name,
                "sh", "-c", f"cat > {container_file}"
            ],
            input=code_content,
            text=True,
            capture_output=True
        )

        if write_result.returncode != 0:
            raise Exception(f"File write failed: {write_result.stderr}")

        # if cp_result.returncode != 0:
        #     raise Exception(cp_result.stderr)

        # 4️ Execute code
        result = subprocess.run(
            ["docker", "exec", container_name, "python", container_file],
            capture_output=True,
            text=True,
            timeout=config.worker_timeout_seconds
        )

        print("RETURN CODE:", result.returncode)
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)

        # 5️ Raise error for retry system
        if result.returncode != 0:
            raise Exception(result.stderr)

        # 6️ Cleanup file inside container
        subprocess.run(
            ["docker", "exec", container_name, "rm", "-f", container_file]
        )
        exit_reason = "success" if result.returncode == 0 else "error"
        status = "completed"
        output = result.stdout
        error = ""
        redis_conn.incr("metrics:jobs_completed")

    except subprocess.TimeoutExpired:
        print(" Timeout occurred")
        exit_reason = "timeout"
        status = "timeout"
        output = ""
        error = "Code execution exceeded time limit (5 seconds)"

        # Kill python process if still running
        subprocess.run(
            ["docker", "exec", container_name, "pkill", "-f", "python"],
            capture_output=True
        )
        # raise Exception("Execution timed out")
        redis_conn.incr("metrics:jobs_timeout")

    except Exception as e:
        exit_reason = "error"
        print(" Exception:", str(e))
        redis_conn.incr("metrics:jobs_failed")
        raise e  # IMPORTANT for retry

    finally:
        # Always release container
        if container_name:
            release_container(container_name)
        redis_conn.decr(user_job_key)
        execution_time = round(time.time() - start_time, 3)

        # Store result
        redis_conn.set(job_id, json.dumps({
            "status": status,
            "output": output,
            "error": error,
            "execution_time": execution_time,
            "container_name": container_name,
            "exit_reason": exit_reason,
            "timestamp": int(time.time())
        }))

    return {
        "job_id": job_id,
        "status": status,
        "output": output,
        "error": error,
        "execution_time": execution_time,
        "container_name": container_name,
        "exit_reason": exit_reason,
        "timestamp": int(time.time())
    }

# -----------------------------
# START WORKER
# -----------------------------
if __name__ == "__main__":
    from rq import Worker

    # Start heartbeat thread
    heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
    heartbeat_thread.start()

    print(f" Worker started: {worker_id}")

    worker = Worker([queue], connection=redis_conn)
    worker.work()