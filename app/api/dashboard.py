import redis
from fastapi import APIRouter, Depends, Header, HTTPException, status
from datetime import datetime
from app.env_config.config import Config

config = Config()
router = APIRouter()
redis_conn = redis.Redis(host=config.redis_host, port=config.redis_port, db=config.redis_db)


def validate_admin_token(x_admin_token: str | None = Header(None)):
    if config.admin_token and x_admin_token != config.admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid admin token",
        )
    return True


@router.get("/admin/dashboard")
def admin_dashboard(_auth: bool = Depends(validate_admin_token)):
    total_jobs = int(redis_conn.get("metrics:jobs_total") or 0)
    completed_jobs = int(redis_conn.get("metrics:jobs_completed") or 0)
    failed_jobs = int(redis_conn.get("metrics:jobs_failed") or 0)
    timeout_jobs = int(redis_conn.get("metrics:jobs_timeout") or 0)
    queue_length = redis_conn.llen(f"rq:queue:{config.rq_queue_name}")
    success_rate = 0.0
    if total_jobs > 0:
        success_rate = (completed_jobs / total_jobs) * 100.0

    return {
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "timeout_jobs": timeout_jobs,
        "queue_length": queue_length,
        "success_rate": success_rate,
        "timestamp": datetime.utcnow(),
    }
