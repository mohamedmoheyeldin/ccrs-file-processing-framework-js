import os
import shutil

def get_files(directory):
    if not os.path.exists(directory):
        return []

    return [
        os.path.join(directory, f)
        for f in os.listdir(directory)
        if os.path.isfile(os.path.join(directory, f)) and f.lower().endswith(".json")
    ]

def save_file(output_dir, filename, content):
    os.makedirs(output_dir, exist_ok=True)

    with open(os.path.join(output_dir, filename), "w", encoding="utf-8") as f:
        f.write(content)

def directory_has_contents(directory):
    if not os.path.isdir(directory):
        return False

    with os.scandir(directory) as entries:
        return any(entries)

def clear_directory(directory):
    if not os.path.isdir(directory):
        return

    for entry in os.scandir(directory):
        path = entry.path
        if entry.is_dir():
            shutil.rmtree(path)
        else:
            os.remove(path)

def remove_json_files(directory):
    if not os.path.isdir(directory):
        return

    for entry in os.scandir(directory):
        if entry.is_file() and entry.name.lower().endswith(".json"):
            os.remove(entry.path)
