import subprocess
import time

print("Cleaning old workers...")
subprocess.run(["pkill", "-f", "worker.py"], stderr=subprocess.DEVNULL)

time.sleep(1)

print("Setting up containers...")
subprocess.run(["../venv/bin/python3", "setup_containers.py"])

print("Starting workers...")
workers = []
for _ in range(3):
    p = subprocess.Popen(["../venv/bin/python3", "worker.py"])
    workers.append(p)

print(" System is up with 3 workers")