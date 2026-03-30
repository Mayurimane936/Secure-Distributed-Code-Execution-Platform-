# 🚀 Distributed Secure Code Execution Platform

A production-style distributed system that securely executes untrusted user code using Docker containers, Redis queues, and worker orchestration.


## Key Features

* 🐳 Docker-based isolated execution
* 🔒 Atomic container locking using Redis
* 💓 Worker heartbeat monitoring (failure detection)
* ⚡ Distributed workers using RQ (Redis Queue)
* 🧹 Auto container cleanup before/after execution
* ⛔ Secure sandbox (no network, limited CPU/memory)
* 🔁 Retry mechanism for failed jobs

---

## System Architecture

```
        +-------------+
        |   Client    |
        +-------------+
               |
               v
        +-------------+
        |   FastAPI   |
        |  (Submit)   |
        +-------------+
               |
               v
        +-------------+
        |   Redis     |
        |   Queue     |
        +-------------+
          /    |    \
         v     v     v
   +--------+ +--------+ +--------+
   |Worker 1| |Worker 2| |Worker 3|
   +--------+ +--------+ +--------+
         \      |      /
          v     v     v
     +----------------------+
     | Docker Containers    |
     | code_runner_1..3     |
     +----------------------+
```

---

##  Prerequisites

### 1. Install WSL (Windows Only)

```bash
wsl --install
```

Install Ubuntu from Microsoft Store.

---

### 2. Install Docker

```bash
sudo apt update
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker
```

Add user to docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

### 3. Install Redis

```bash
sudo apt install redis-server -y
sudo service redis-server start
```

Check:

```bash
redis-cli ping
# PONG
```

---

### 4. Install Python

```bash
sudo apt install python3 python3-pip python3-venv -y
```

---

## 📦 Project Setup

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
```

---

### Create Virtual Environment

```bash
python3 -m venv myenv
source myenv/bin/activate
```

---

### Install Dependencies

```bash
pip install -r requirements.txt
```

---

## requirements.txt

```
fastapi
uvicorn
redis
rq
pydantic
```

---

## Setup Docker Containers

```bash
python3 setup_containers.py
```

This will create:

* code_runner_1
* code_runner_2
* code_runner_3

Each container is:

* memory limited
* CPU limited
* no network access
* read-only filesystem

---

## Start the System

```bash
python3 start_system.py
```

This will:

* Start containers
* Start multiple workers
* Begin heartbeat monitoring

---

## Run API Server

```bash
uvicorn main:app --reload
```

---

## API Usage

### Submit Code

```bash
POST /submit
```

```json
{
  "code": "print('Hello World')"
}
```

---

### Check Status

```bash
GET /status/{job_id}
```

---

## How It Works

### Atomic Locking

* Redis `SET NX` ensures only ONE worker uses a container
* Prevents race conditions

---

### Heartbeat Monitoring

* Each worker updates Redis every 3 seconds
* If worker crashes → key expires
* System detects dead workers

---

### Secure Execution

Each job runs inside isolated container:

* No internet
* Limited memory (100MB)
* Limited CPU
* No privilege escalation

---

## Cleanup Strategy

Before execution:

```bash
rm -rf /app/*
```

After execution:

* File removed
* Container reused

---

## Common Errors & Fixes

### Error: `/app not found`

Fix:

```bash
docker exec code_runner_1 mkdir -p /app
```

---

### Error: Address already in use

```bash
lsof -i :8000
kill -9 <PID>
```

---

### Docker permission denied

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## Testing

Submit:

```python
print("Hello from container")
```

Expected:

```
Hello from container
```

---

## Stop System

```bash
docker rm -f code_runner_1 code_runner_2 code_runner_3
```


## Author

Mayuri Mane
Security Engineer | Backend Developer

---

## ⭐ If you like this project

Give it a ⭐ on GitHub!
