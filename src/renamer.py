import json
import os
import re
from app_paths import data_path

RULES_PATH = data_path("config", "rules.json")

try:
    with open(RULES_PATH, encoding="utf-8") as f:
        rules = json.load(f)
except FileNotFoundError as error:
    raise FileNotFoundError(
        f"Required config file was not found: {RULES_PATH}. Rebuild the packaged app so the config folder is included."
    ) from error

FILENAME_CODE_PATTERN = re.compile(r"(?<=VA)[A-Za-z0-9]+(?=DMV[A-Za-z0-9]+(?:_|\.|$))")
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]+')

def sanitize_filename_base(value):
    sanitized = (value or "").strip()
    if not sanitized:
        return ""

    sanitized = re.sub(r"\.json$", "", sanitized, flags=re.IGNORECASE)
    sanitized = INVALID_FILENAME_CHARS.sub("_", sanitized)
    return sanitized.strip(" .")


def rename_file(filepath, replacement_code=None, file_index=None, total_files=None):
    filename = os.path.basename(filepath)

    if replacement_code:
        sanitized_base = sanitize_filename_base(replacement_code)
        if sanitized_base:
            if total_files and total_files > 1 and file_index is not None:
                return f"{sanitized_base}_{file_index}.json"
            return f"{sanitized_base}.json"

    for rule in rules.get("rename", []):
        if rule["match"] in filename:
            filename = filename.replace(rule["match"], rule["replace"])

    name_root, _ = os.path.splitext(filename)
    filename = f"{name_root}.json"
    return filename
