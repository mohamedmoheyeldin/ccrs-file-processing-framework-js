import json
import os
import shutil
import sys
import traceback
from contextlib import redirect_stdout
from io import StringIO

from app_paths import data_path, ensure_runtime_files
from content_editor import (
    LIST_DATE_FORMAT,
    PAYMENT_AUTHORITY_CODE_LENGTH,
    REFERRAL_NUMBER_DIGIT_COUNT,
    REFERRAL_NUMBER_PREFIX,
    STATION_ID_MAX_LENGTH,
    generate_optional_field_overrides,
    validate_referral_number_start,
    validate_ssn,
)
from logger import setup_logger
from processor import process_files
from referral_generator import (
    ROTATE_ALL_TEMPLATES,
    build_generated_referral_sources,
    get_referral_template_metadata,
    get_referral_template_options,
)
from uploader import (
    get_server_display_for_target,
    get_upload_profile_source_path,
    get_upload_target_names,
    get_user_names_for_server,
    import_upload_source_to_config,
    load_upload_profiles,
    resolve_upload_targets,
)


def emit(payload):
    sys.__stdout__.write(json.dumps(payload) + "\n")
    sys.__stdout__.flush()


def load_request():
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return json.loads(raw)


def build_upload_targets(profiles):
    targets = []
    for target_name in get_upload_target_names(profiles):
        targets.append(
            {
                "name": target_name,
                "serverDisplay": get_server_display_for_target(profiles, target_name),
                "users": get_user_names_for_server(profiles, target_name),
                "defaultRemoteDirectory": "/CCRA_Uploads",
            }
        )
    return targets


def build_info():
    profiles = load_upload_profiles()
    profile_source_path, profile_source_kind = get_upload_profile_source_path()
    return {
        "runtimeRoot": data_path(""),
        "profileSource": {
            "path": profile_source_path,
            "kind": profile_source_kind,
        },
        "templateOptions": get_referral_template_options(),
        "templateMetadata": get_referral_template_metadata(),
        "uploadTargets": build_upload_targets(profiles),
        "constants": {
            "listDateFormat": LIST_DATE_FORMAT,
            "referralNumberPrefix": REFERRAL_NUMBER_PREFIX,
            "referralNumberDigits": REFERRAL_NUMBER_DIGIT_COUNT,
            "stationIdMaxLength": STATION_ID_MAX_LENGTH,
            "paymentAuthorityCodeLength": PAYMENT_AUTHORITY_CODE_LENGTH,
            "rotateAllTemplatesLabel": ROTATE_ALL_TEMPLATES,
        },
    }


def build_upload_options(payload):
    upload_payload = payload.get("upload") or {}
    if not upload_payload.get("enabled"):
        return None

    selected_targets = upload_payload.get("targets") or []
    profiles = load_upload_profiles()
    return {
        "enabled": True,
        "targets": resolve_upload_targets(profiles, selected_targets),
    }


def build_common_kwargs(payload, progress_phase):
    ssn_value = (payload.get("ssnValue") or "999-99-0001").strip()
    validate_ssn(ssn_value)

    referral_code = (payload.get("referralReplacementCode") or "").strip()
    if referral_code:
        referral_code = validate_referral_number_start(referral_code)

    list_date_override = (payload.get("listDateOverride") or "").strip() or None
    optional_overrides = generate_optional_field_overrides(payload.get("optionalOverrides") or {})

    def progress_callback(current, total, filename, state, upload_target=None):
        emit(
            {
                "type": "progress",
                "phase": progress_phase,
                "current": current,
                "total": total,
                "filename": filename,
                "state": state,
                "uploadTarget": upload_target,
            }
        )

    return {
        "output_dir": (payload.get("outputDir") or "").strip(),
        "replacement_code": (payload.get("replacementCode") or "").strip(),
        "clear_output": bool(payload.get("clearOutput")),
        "referral_replacement_code": referral_code,
        "list_date_override": list_date_override,
        "ssn_value": ssn_value,
        "optional_overrides": optional_overrides,
        "keep_processed_json": bool(payload.get("keepProcessedJson", True)),
        "progress_callback": progress_callback,
        "upload_options": build_upload_options(payload),
        "archive_basename": (payload.get("archiveBasename") or "").strip() or None,
    }


def handle_info(_payload):
    return build_info()


def handle_import_upload_source(payload):
    source_path = (payload.get("sourcePath") or "").strip()
    result = import_upload_source_to_config(source_path)
    return {
        "importResult": result,
        "info": build_info(),
    }


def handle_process(payload):
    input_dir = (payload.get("inputDir") or "").strip()
    if not input_dir:
        raise ValueError("Please select a source folder.")

    common_kwargs = build_common_kwargs(payload, "process")
    if not common_kwargs["output_dir"]:
        raise ValueError("Please select an output folder.")

    with redirect_stdout(StringIO()):
        message = process_files(
            input_dir=input_dir,
            **common_kwargs,
        )
    return {"message": message}


def handle_generate(payload):
    template_option = (payload.get("templateOption") or "").strip() or ROTATE_ALL_TEMPLATES
    file_count = int(payload.get("fileCount") or 0)
    referrals_per_file = int(payload.get("referralsPerFile") or 0)

    if file_count <= 0:
        raise ValueError("Files to generate must be greater than zero.")
    if referrals_per_file <= 0:
        raise ValueError("Referrals per file must be greater than zero.")

    common_kwargs = build_common_kwargs(payload, "generate")
    if not common_kwargs["output_dir"]:
        raise ValueError("Please select an output folder.")

    generated_input_dir = ""
    try:
        generated_input_dir = build_generated_referral_sources(
            template_option,
            file_count,
            referrals_per_file,
        )
        with redirect_stdout(StringIO()):
            message = process_files(
                input_dir=generated_input_dir,
                **common_kwargs,
            )
        return {"message": message}
    finally:
        if generated_input_dir and os.path.isdir(generated_input_dir):
            shutil.rmtree(generated_input_dir, ignore_errors=True)


HANDLERS = {
    "info": handle_info,
    "import-upload-source": handle_import_upload_source,
    "process": handle_process,
    "generate": handle_generate,
}


def main():
    ensure_runtime_files()
    setup_logger()

    command = sys.argv[1] if len(sys.argv) > 1 else "info"
    if command not in HANDLERS:
        raise ValueError(f"Unsupported command: {command}")

    payload = load_request()
    result = HANDLERS[command](payload)
    emit({"type": "result", "command": command, "data": result})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit(
            {
                "type": "error",
                "message": str(error),
                "traceback": traceback.format_exc(),
            }
        )
        sys.exit(1)
