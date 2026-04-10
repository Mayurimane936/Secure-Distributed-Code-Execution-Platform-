import os
from typing import List, Optional


def parse_int(value: Optional[str], default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_list(value: Optional[str], default: List[str], item_type=str) -> List:
    if value is None or value.strip() == "":
        return default
    items = [item.strip() for item in value.split(",") if item.strip()]
    if item_type is int:
        parsed = []
        for item in items:
            try:
                parsed.append(int(item))
            except ValueError:
                continue
        return parsed if parsed else default
    return items


class Config:
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = parse_int(os.getenv("REDIS_PORT"), 6379)
    redis_db: int = parse_int(os.getenv("REDIS_DB"), 0)
    redis_container_name: str = os.getenv("REDIS_CONTAINER_NAME", "redis-server")
    redis_image: str = os.getenv("REDIS_IMAGE", "redis:alpine")
    redis_port_map: str = os.getenv("REDIS_PORT_MAP", "6379:6379")

    containers: List[str] = parse_list(
        os.getenv("CONTAINERS"),
        ["code_runner_1", "code_runner_2", "code_runner_3"],
    )
    docker_image: str = os.getenv("DOCKER_IMAGE", "python:3.9")
    container_memory: str = os.getenv("CONTAINER_MEMORY", "100m")
    container_cpus: str = os.getenv("CONTAINER_CPUS", "0.5")
    container_pids_limit: int = parse_int(os.getenv("CONTAINER_PIDS_LIMIT"), 50)
    container_user: str = os.getenv("CONTAINER_USER", "nobody")

    python_executable: str = os.getenv("PYTHON_EXECUTABLE", "../venv/bin/python3")
    worker_count: int = parse_int(os.getenv("WORKER_COUNT"), 3)
    worker_timeout_seconds: int = parse_int(os.getenv("WORKER_TIMEOUT_SECONDS"), 5)

    rate_limit_per_minute: int = parse_int(os.getenv("RATE_LIMIT_PER_MINUTE"), 10)
    max_concurrent_jobs: int = parse_int(os.getenv("MAX_CONCURRENT_JOBS"), 2)
    retry_max: int = parse_int(os.getenv("RETRY_MAX"), 3)
    retry_intervals: List[int] = parse_list(
        os.getenv("RETRY_INTERVALS"),
        [5, 10, 20],
        item_type=int,
    )
    rq_queue_name: str = os.getenv("RQ_QUEUE_NAME", "default")
