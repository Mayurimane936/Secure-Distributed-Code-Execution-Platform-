import os
import subprocess
import json
import time
import uuid
import threading

from redis import Redis
from rq import Queue
from utils import store_code_to_file
import random


containers = ["code_runner_1", "code_runner_2", "code_runner_3"]

redis_conn = Redis(host='localhost', port=6379)
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
    job_id = job_data["job_id"]
    code = job_data["code"]

    container_name = None  # for safety

    try:
        # 1️ Lock container
        container_name = get_free_container()

        # 2️ Store code
        file_path = store_code_to_file(code, job_id)
        container_file = f"/app/{job_id}.py"

        #  Clean container before use
        cleanup = subprocess.run(
            ["docker", "exec", container_name, "sh", "-c", "rm -rf /app/*"],
            capture_output=True,
            text=True
        )

        if cleanup.returncode != 0:
            raise Exception(f"Cleanup failed: {cleanup.stderr}")

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
            timeout=10
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

        status = "completed"
        output = result.stdout
        error = ""

    except subprocess.TimeoutExpired:
        print(" Timeout occurred")
        raise Exception("Execution timed out")

    except Exception as e:
        print(" Exception:", str(e))
        raise e  # IMPORTANT for retry

    finally:
        # Always release container
        if container_name:
            release_container(container_name)

    # Store result
    redis_conn.set(job_id, json.dumps({
        "status": status,
        "output": output,
        "error": error
    }))

    return {
        "job_id": job_id,
        "status": status,
        "output": output,
        "error": error
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