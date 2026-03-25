import gzip
import json
import os
import re
import io

DEFAULT_ARCHIVE_BASENAME = "processed_files"


def sanitize_archive_basename(value):
    basename = (value or "").strip()
    if not basename:
        return DEFAULT_ARCHIVE_BASENAME

    basename = re.sub(r"\.(json|gz)$", "", basename, flags=re.IGNORECASE)
    basename = re.sub(r'[<>:"/\\|?*]+', "_", basename)
    basename = basename.strip(" .")
    return basename or DEFAULT_ARCHIVE_BASENAME


def zip_output(folder, archive_basename=DEFAULT_ARCHIVE_BASENAME):
    if not os.path.exists(folder):
        return None

    archive_basename = sanitize_archive_basename(archive_basename)

    combined_container = None
    fallback_payloads = []

    for filename in sorted(os.listdir(folder)):
        file_path = os.path.join(folder, filename)

        if not os.path.isfile(file_path) or not filename.lower().endswith(".json"):
            continue

        with open(file_path, "r", encoding="utf-8") as json_file:
            raw_content = json_file.read()

        try:
            content = json.loads(raw_content)
        except json.JSONDecodeError:
            content = raw_content

        if isinstance(content, dict) and isinstance(content.get("Referrals"), list):
            if combined_container is None:
                combined_container = dict(content)
                combined_container["Referrals"] = list(content.get("Referrals", []))
            else:
                combined_container.setdefault("Referrals", [])
                combined_container["Referrals"].extend(content.get("Referrals", []))
                for key, value in content.items():
                    if key == "Referrals":
                        continue
                    if key not in combined_container or combined_container.get(key) in ("", None, [], {}):
                        combined_container[key] = value
        else:
            fallback_payloads.append({
                "filename": filename,
                "content": content
            })

    archive_path = os.path.join(folder, f"{archive_basename}.gz")
    payload_filename = f"{archive_basename}.json"

    payload = combined_container if combined_container is not None else fallback_payloads

    with open(archive_path, "wb") as raw_file:
        with gzip.GzipFile(filename=payload_filename, mode="wb", fileobj=raw_file, mtime=0) as gzip_stream:
            with io.TextIOWrapper(gzip_stream, encoding="utf-8") as gzip_file:
                json.dump(payload, gzip_file, ensure_ascii=False, indent=2)

    return archive_path
