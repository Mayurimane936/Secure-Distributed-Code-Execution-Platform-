from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from rq import Queue, Retry
from redis import Redis
import uuid
import json
from app.api.dashboard import router as dashboard_router
from app.env_config.config import Config

config = Config()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    app.state.redis_conn = Redis(
        host=config.redis_host,
        port=config.redis_port,
        db=config.redis_db,
    )
    app.state.queue = Queue(config.rq_queue_name, connection=app.state.redis_conn)


@app.on_event("shutdown")
def shutdown_event():
    redis_conn = getattr(app.state, "redis_conn", None)
    if redis_conn is not None:
        redis_conn.close()


class CodeSubmission(BaseModel):
    code: str = Field(
        ..., 
        min_length=1,
        max_length=config.max_code_length,
        description="Python code to execute",
    )
    language: str = Field(
        "python",
        description="Execution language",
    )
    timeout_seconds: int = Field(
        config.worker_timeout_seconds,
        ge=1,
        le=config.max_timeout_seconds,
        description="Maximum execution timeout in seconds",
    )


def get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return "unknown"


@app.get("/")
def home():
    return {"message": "Secure Code Execution Platform 🚀"}


@app.post("/submit-code")
def submit_code(request_data: CodeSubmission, request: Request):
    redis_conn = app.state.redis_conn
    queue = app.state.queue

    client_ip = get_client_ip(request)
    rate_key = f"rate_limit:{client_ip}"
    request_count = redis_conn.incr(rate_key)

    if request_count == 1:
        redis_conn.expire(rate_key, 60)

    user_job_key = f"user_jobs:{client_ip}"
    running_jobs = int(redis_conn.get(user_job_key) or 0)

    if request_count > config.rate_limit_per_minute:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    if running_jobs >= config.max_concurrent_jobs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Concurrency limit exceeded. Max {config.max_concurrent_jobs} "
                "running jobs per user."
            ),
        )

    if request_data.language not in config.supported_languages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported language '{request_data.language}'. "
                f"Supported languages: {config.supported_languages}"
            ),
        )

    job_id = str(uuid.uuid4())
    redis_conn.set(job_id, json.dumps({
        "status": "pending",
        "output": "",
        "error": "",
    }))
    redis_conn.expire(job_id, config.job_result_ttl)
    redis_conn.incr(user_job_key)
    redis_conn.expire(user_job_key, config.max_timeout_seconds * 3)

    queue.enqueue(
        "app.worker.worker.execute_code",
        job_id,
        request_data.code,
        client_ip,
        request_data.timeout_seconds,
        retry=Retry(max=config.retry_max, interval=config.retry_intervals),
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "job_id": job_id,
            "status": "queued",
            "language": request_data.language,
            "timeout_seconds": request_data.timeout_seconds,
        },
    )


@app.get("/job-status/{job_id}")
def job_status(job_id: str):
    redis_conn = app.state.redis_conn
    job_data = redis_conn.get(job_id)

    if not job_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    job = json.loads(job_data.decode("utf-8"))

    return {
        "job_id": job_id,
        "status": job["status"],
        "output": job.get("output", ""),
        "debug_output": job.get("debug_output", ""),
        "error": job["error"],
        "execution_time": job.get("execution_time"),
        "container_name": job.get("container_name"),
        "exit_reason": job.get("exit_reason"),
        "timestamp": job.get("timestamp"),
    }


@app.get("/events/{job_id}")
async def job_events(request: Request, job_id: str):
    """Server-Sent Events endpoint that streams job updates to clients.

    This keeps polling on the server-side (single poll per connected client)
    and pushes updates when the job state changes, reducing client-side
    polling commands against Redis.
    """
    redis_conn = app.state.redis_conn

    async def event_generator():
        last_status = None
        while True:
            if await request.is_disconnected():
                break
            try:
                job_data = redis_conn.get(job_id)
                if job_data:
                    job = json.loads(job_data.decode("utf-8"))
                    status = job.get("status")
                    if status != last_status:
                        last_status = status
                        payload = json.dumps(job)
                        yield f"data: {payload}\n\n"
                        # If finished, close stream after delivering final state
                        if status not in ("queued", "running", "pending"):
                            break
            except Exception:
                # on error, yield a brief noop to keep connection alive
                try:
                    yield "data: {\"error\": \"redis-error\"}\n\n"
                except Exception:
                    pass
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health/live")
def health_live():
    return {"status": "alive"}


@app.get("/health/ready")
def health_ready():
    redis_conn = app.state.redis_conn
    try:
        redis_conn.ping()
        return {"status": "ready"}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis not available",
        )


@app.get("/health/workers")
def worker_health():
    redis_conn = app.state.redis_conn
    worker_keys = redis_conn.keys("worker:*")
    workers = []
    for key in worker_keys:
        worker_id = key.decode().split(":")[1]
        last_seen = int(redis_conn.get(key) or 0)

        workers.append({
            "worker_id": worker_id,
            "last_seen": last_seen,
            "status": "alive",
        })
    return {
        "workers_active": len(workers),
        "workers": workers,
    }


app.include_router(dashboard_router)
