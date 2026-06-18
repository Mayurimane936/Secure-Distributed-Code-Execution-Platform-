import subprocess
import json
import time
import uuid
import threading
import logging
import random
from redis import Redis
from app.env_config.config import Config
import os

config = Config()

redis_url = os.getenv("REDIS_URL")

if redis_url:
    redis_conn = Redis.from_url(redis_url)
else:
    redis_conn = Redis(
        host=config.redis_host,
        port=config.redis_port,
        db=config.redis_db,
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

worker_id = str(uuid.uuid4())
CONTAINER_POOL = config.containers  # e.g., ["code_runner_1", "code_runner_2", "code_runner_3"]


def send_heartbeat():
    while True:
        try:
            redis_conn.set(
                f"worker:{worker_id}",
                int(time.time()),
                ex=10,
            )
            logger.debug("Heartbeat from %s", worker_id)
        except Exception:
            logger.exception("Worker heartbeat failed")
        time.sleep(3)


def execute_code(job_id, code, user_ip, timeout_seconds=None):
    start_time = time.time()
    redis_conn.incr("metrics:jobs_total")
    current_minute = int(time.time() / 60)
    redis_conn.incr(f"metrics:jobs_minute:{current_minute}")

    user_job_key = f"user_jobs:{user_ip}"
    timeout_seconds = int(timeout_seconds or config.worker_timeout_seconds)
    timeout_seconds = min(timeout_seconds, config.max_timeout_seconds)

    status = "error"
    output = ""
    error = ""
    exit_reason = "unknown"
    container_name = None

    # Select container from pool (round-robin or random)
    selected_container = random.choice(CONTAINER_POOL)
    container_lock_key = f"container_lock:{selected_container}"

    try:
        # Acquire lock for the container to ensure sequential execution
        lock_acquired = False
        lock_wait_time = 0
        max_wait = 30  # Max 30 seconds to acquire lock

        while lock_wait_time < max_wait:
            if redis_conn.set(container_lock_key, job_id, nx=True, ex=timeout_seconds + 10):
                lock_acquired = True
                break
            time.sleep(0.1)
            lock_wait_time += 0.1

        if not lock_acquired:
            logger.error("Job %s failed to acquire lock for container %s", job_id, selected_container)
            status = "error"
            error = f"Failed to acquire container lock for {selected_container}"
            exit_reason = "lock_timeout"
            redis_conn.incr("metrics:jobs_failed")
            return

        container_name = selected_container

        # Clean container state before execution
        cleanup_cmd = [
            "docker", "exec", container_name,
            "sh", "-c", "rm -rf /tmp/* /app/*"
        ]
        try:
            if not os.getenv("RENDER"):
                subprocess.run(cleanup_cmd, capture_output=True, timeout=5, text=True)
                logger.debug("Cleaned container %s state", container_name)
        except Exception as e:
            logger.warning("Failed to clean container %s: %s", container_name, e)

        # Write code to container and execute
        docker_command = [
            "docker", "exec", "-i", container_name,
            "sh", "-c",
            f"cat > /tmp/{job_id}.py && python -u /tmp/{job_id}.py"
        ]

        logger.info("Executing job %s in pooled container %s", job_id, container_name)
        if os.getenv("RENDER"):
        # Running on Render: execute directly
            result = subprocess.run(
                ["python", "-c", code],
                text=True,
                capture_output=True,
                timeout=timeout_seconds,
            )
        else:
        # Local machine: execute inside Docker container
            result = subprocess.run(
                docker_command,
                input=code,
                text=True,
                capture_output=True,
                timeout=timeout_seconds,
            )

        logger.info("Job %s exited with code %s", job_id, result.returncode)
        logger.debug("stdout=%s", result.stdout)
        logger.debug("stderr=%s", result.stderr)

        debug_output = result.stderr or ""
        if result.returncode != 0:
            status = "failed"
            exit_reason = "runtime_error"
            output = result.stdout
            error = result.stderr.strip() or result.stdout.strip() or f"Process exited with code {result.returncode}"
            redis_conn.incr("metrics:jobs_failed")
        else:
            status = "completed"
            exit_reason = "success"
            output = result.stdout
            error = ""
            redis_conn.incr("metrics:jobs_completed")

    except subprocess.TimeoutExpired:
        logger.warning("Job %s timed out after %s seconds in %s", job_id, timeout_seconds, container_name)
        exit_reason = "timeout"
        status = "timeout"
        output = ""
        error = f"Code execution exceeded time limit ({timeout_seconds} seconds)"
        redis_conn.incr("metrics:jobs_timeout")
    except Exception as exc:
        logger.exception("Job %s failed with internal error in %s", job_id, container_name)
        exit_reason = "internal_error"
        status = "error"
        error = str(exc)
        redis_conn.incr("metrics:jobs_failed")
    finally:
        # Release container lock
        if container_name:
            try:
                redis_conn.delete(f"container_lock:{container_name}")
                logger.debug("Released lock for container %s", container_name)
            except Exception:
                logger.exception("Failed to release container lock for %s", container_name)

        try:
            redis_conn.decr(user_job_key)
        except Exception:
            logger.exception("Failed to decrement active job counter for %s", user_ip)

        execution_time = round(time.time() - start_time, 3)
        redis_conn.set(job_id, json.dumps({
            "status": status,
            "output": output,
            "error": error,
            "debug_output": debug_output if 'debug_output' in locals() else "",
            "execution_time": execution_time,
            "container_name": container_name,
            "exit_reason": exit_reason,
            "timestamp": int(time.time()),
        }))
        # Set TTL on job results to avoid unbounded storage in Redis (configurable)
        try:
            from app.env_config.config import Config as _Config
            _cfg = _Config()
            redis_conn.expire(job_id, _cfg.job_result_ttl)
        except Exception:
            # Fallback TTL
            redis_conn.expire(job_id, 3600)

    return {
        "job_id": job_id,
        "status": status,
        "output": output,
        "error": error,
        "debug_output": debug_output if 'debug_output' in locals() else "",
        "execution_time": execution_time if 'execution_time' in locals() else 0,
        "container_name": container_name,
        "exit_reason": exit_reason,
        "timestamp": int(time.time()),
    }


if __name__ == "__main__":
    from rq import Worker, Queue

    heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
    heartbeat_thread.start()

    logger.info("Worker started: %s", worker_id)

    queue = Queue(connection=redis_conn)
    worker = Worker([queue], connection=redis_conn)
    worker.work()
