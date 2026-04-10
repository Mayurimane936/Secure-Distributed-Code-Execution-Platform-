import subprocess
import time
from config import Config

config = Config()

print("Cleaning old workers...")
subprocess.run(["pkill", "-f", "worker.py"], stderr=subprocess.DEVNULL)

time.sleep(1)

print("Setting up containers...")
subprocess.run(["../venv/bin/python3", "setup_containers.py"])

print("Starting workers...")
workers = []
for _ in range(config.worker_count):
    p = subprocess.Popen([config.python_executable, "worker.py"])
    workers.append(p)

print(f" System is up with {config.worker_count} workers")