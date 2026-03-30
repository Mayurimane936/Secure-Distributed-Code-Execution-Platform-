import subprocess

containers = ["code_runner_1", "code_runner_2", "code_runner_3"]

for c in containers:
    # Remove if exists
    subprocess.run(["docker", "rm", "-f", c], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Create fresh container
    subprocess.run([
    "docker", "run", "-dit",
    "--name", c,
    "--memory=100m",
    "--cpus=0.5",
    "--pids-limit=50",
    "--read-only",
    "--tmpfs", "/tmp",
    "--tmpfs", "/app",   # ✅ IMPORTANT FIX
    "--network", "none",
    "--security-opt", "no-new-privileges",
    "python:3.9",
    "sleep", "infinity"
    ])

    print(f"✅ Container {c} started")

    subprocess.run([
    "docker", "exec", c,
    "mkdir", "-p", "/app"
    ])