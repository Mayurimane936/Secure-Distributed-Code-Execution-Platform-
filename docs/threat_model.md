# Threat Model

## System Overview

A distributed platform that executes untrusted user code inside Docker containers.

Components:
- FastAPI API Server
- Redis Queue
- Worker Processes
- Docker Execution Containers

---

## Threat Analysis

| Threat | Example | Impact | Mitigation |
|------|------|------|------|
| Infinite Loop | while True | Worker blocked | Execution timeout |
| Fork Bomb | os.fork() | Resource exhaustion | Container PID limit |
| Memory Exhaustion | Large arrays | Host crash | Memory limit |
| Queue Flooding | spam requests | System overload | Rate limiting |
| File Abuse | write huge files | Disk exhaustion | Cleanup + tmpfs |
| Container Escape | access host files | Host compromise | Docker isolation |

---

## Security Controls

1. Execution timeout
2. Docker sandbox
3. Container cleanup
4. Redis rate limiting
5. Worker container locking
6. Worker health heartbeat
7. Metrics monitoring

---

## Residual Risks

Remaining risks include:

- Kernel vulnerabilities
- Advanced container escape techniques
- Redis single point of failure