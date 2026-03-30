import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

def store_code_to_file(code, job_id):
    os.makedirs(DATA_DIR, exist_ok=True)
    file_path = os.path.join(DATA_DIR, f"{job_id}_usercode.py")
    with open(file_path, "w") as f:
        f.write(code)
    return file_path
