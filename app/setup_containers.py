import subprocess

# Start Redis container
subprocess.run(["docker", "rm", "-f", "redis-server"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run([
    "docker", "run", "-d", "--name", "redis-server", "-p", "6379:6379", "redis:alpine"
])

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
    "--tmpfs", "/app",   
    # "--tmpfs", "/app:rw,uid=65534,gid=65534",
    "--network", "none",
    "--user", "nobody",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "python:3.9",
    "sleep", "infinity"
    ])

    print(f" Container {c} started")

    subprocess.run([
    "docker", "exec", c,
    "mkdir", "-p", "/app"
    ])