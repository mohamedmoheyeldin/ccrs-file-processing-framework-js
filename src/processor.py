import os
import logging
from file_handler import clear_directory, directory_has_contents, get_files, remove_json_files, save_file
from renamer import rename_file
from content_editor import modify_content
from uploader import upload_file
from zipper import zip_output

def process_files(
    input_dir,
    output_dir,
    replacement_code=None,
    clear_output=False,
    referral_replacement_code=None,
    list_date_override=None,
    ssn_value="999-99-0001",
    optional_overrides=None,
    keep_processed_json=True,
    progress_callback=None,
    upload_options=None,
    archive_basename=None,
):
    files = get_files(input_dir)

    if not files:
        logging.warning("No files found in input directory.")
        print("No files found.")
        return "No files found in the selected source folder."

    processed_count = 0
    error_count = 0
    referral_sequence_index = 1

    # Start from a clean JSON workspace so a new run does not mix with prior loose JSON files.
    remove_json_files(output_dir)

    if clear_output and directory_has_contents(output_dir):
        clear_directory(output_dir)
        logging.info(f"Cleared existing files from: {output_dir}")

    total_files = len(files)

    for index, file in enumerate(files, start=1):
        try:
            new_name = rename_file(file, replacement_code, index, total_files)
            content, referral_numbers_used = modify_content(
                file,
                referral_replacement_code,
                list_date_override,
                ssn_value,
                index,
                total_files,
                optional_overrides,
                referral_sequence_index,
            )
            save_file(output_dir, new_name, content)
            if referral_numbers_used:
                referral_sequence_index += referral_numbers_used

            logging.info(f"Processed: {file} -> {new_name}")
            processed_count += 1

            if progress_callback:
                progress_callback(index, total_files, os.path.basename(file), "processed")

        except Exception as e:
            logging.error(f"Error processing {file}: {str(e)}")
            error_count += 1

            if progress_callback:
                progress_callback(index, total_files, os.path.basename(file), "error")

    archive_path = zip_output(output_dir, archive_basename)
    uploaded_paths = []

    if archive_path:
        if upload_options and upload_options.get("enabled"):
            selected_targets = upload_options.get("targets", [])
            upload_total = len(selected_targets)
            for upload_index, target in enumerate(selected_targets, start=1):
                if progress_callback:
                    progress_callback(
                        upload_index,
                        upload_total,
                        os.path.basename(archive_path),
                        "uploading",
                        target.get("server_name"),
                    )
                uploaded_path = upload_file(
                    archive_path,
                    target.get("remote_directory"),
                    target.get("connection_details"),
                )
                uploaded_paths.append(
                    {
                        "server_name": target.get("server_name"),
                        "remote_path": uploaded_path,
                    }
                )
                logging.info(
                    f"Uploaded gzip file to {target.get('server_name')}: {uploaded_path}"
                )

        if not keep_processed_json:
            remove_json_files(output_dir)
            logging.info(f"Removed processed JSON files from: {output_dir}")
        logging.info(f"Created gzip file: {archive_path}")
        print("Processing complete. Output compressed as .gz.")
        uploaded_message = ""
        if uploaded_paths:
            uploaded_message = " Uploaded file to " + ", ".join(
                f"{item['server_name']} ({item['remote_path']})" for item in uploaded_paths
            ) + "."
        json_message = (
            f"saved output to {output_dir}"
            if keep_processed_json
            else f"saved output to {output_dir} temporarily"
        )
        return (
            f"Done. Processed {processed_count} file{'s' if processed_count != 1 else ''}, "
            f"{json_message}, and created {archive_path}."
            + uploaded_message
            + (f" {error_count} file{'s' if error_count != 1 else ''} had errors." if error_count else "")
        )
    else:
        print("Processing complete. No gzip file was created.")
        return (
            f"Done. Processed {processed_count} file{'s' if processed_count != 1 else ''} and "
            f"saved output to {output_dir}, but no .gz file was created."
            + (f" {error_count} file{'s' if error_count != 1 else ''} had errors." if error_count else "")
        )
