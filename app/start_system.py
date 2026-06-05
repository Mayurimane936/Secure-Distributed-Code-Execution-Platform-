import os
import subprocess
import time
from env_config.config import Config

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
config = Config()

python_executable = config.python_executable
if not os.path.isabs(python_executable):
    python_executable = os.path.abspath(os.path.join(SCRIPT_DIR, python_executable))

print("Cleaning old workers...")
subprocess.run(["pkill", "-f", "worker.py"], stderr=subprocess.DEVNULL)

time.sleep(1)

print("Setting up containers...")
subprocess.run([python_executable, os.path.join(ROOT_DIR, "app", "setup_containers.py")], cwd=ROOT_DIR)

print("Starting workers...")
env = os.environ.copy()
env["PYTHONPATH"] = ROOT_DIR
workers = []
for _ in range(config.worker_count):
    p = subprocess.Popen(
        [python_executable, os.path.join(ROOT_DIR, "app", "worker", "worker.py")],
        cwd=ROOT_DIR,
        env=env,
    )
    workers.append(p)

print(f" System is up with {config.worker_count} workers")