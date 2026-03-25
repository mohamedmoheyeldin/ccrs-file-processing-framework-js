import logging
import os
from app_paths import data_path

def setup_logger():
    logs_dir = data_path("logs")
    os.makedirs(logs_dir, exist_ok=True)

    logging.basicConfig(
        filename=os.path.join(logs_dir, "process.log"),
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
