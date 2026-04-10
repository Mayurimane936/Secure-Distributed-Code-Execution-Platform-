import subprocess
from config import Config

config = Config()

# Start Redis container
subprocess.run(["docker", "rm", "-f", config.redis_container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run([
    "docker", "run", "-d", "--name", config.redis_container_name,
    "-p", config.redis_port_map,
    config.redis_image
])

containers = config.containers

for c in containers:
    # Remove if exists
    subprocess.run(["docker", "rm", "-f", c], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Create fresh container
    subprocess.run([
    "docker", "run", "-dit",
    "--name", c,
    "--memory", config.container_memory,
    "--cpus", config.container_cpus,
    "--pids-limit", str(config.container_pids_limit),
    "--read-only",
    "--tmpfs", "/tmp",
    "--tmpfs", "/app",   
    # "--tmpfs", "/app:rw,uid=65534,gid=65534",
    "--network", "none",
    "--user", config.container_user,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    config.docker_image,
    "sleep", "infinity"
    ])

    print(f" Container {c} started")

    subprocess.run([
    "docker", "exec", c,
    "mkdir", "-p", "/app"
    ])