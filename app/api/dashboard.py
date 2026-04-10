import redis
from fastapi import FastAPI, APIRouter
from datetime import datetime, timedelta

router = APIRouter()
redis_conn = redis.Redis(host='localhost', port=6379, db=0)

@router.get("/admin/dashboard")
def admin_dashboard():

    total_jobs = int(redis_conn.get("metrics:jobs_total") or 0)
    completed_jobs = int(redis_conn.get("metrics:jobs_completed") or 0)
    failed_jobs = int(redis_conn.get("metrics:jobs_failed") or 0)
    timeout_jobs = int(redis_conn.get("metrics:jobs_timeout") or 0)

    # queue_length = len(redis_conn.llen("rq:queue:default"))
    queue_length = redis_conn.llen("rq:queue:default")
    success_rate = 0
    if total_jobs > 0:
        success_rate = (completed_jobs / total_jobs) * 100


    return {
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "timeout_jobs": timeout_jobs,
        "queue_length": queue_length,
        "success_rate": success_rate,
        "timestamp": datetime.utcnow()
    }