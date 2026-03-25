from datetime import datetime
from processor import process_files
from logger import setup_logger
from content_editor import LIST_DATE_FORMAT, validate_referral_number_start, validate_ssn

if __name__ == "__main__":
    setup_logger()
    input_dir = input("Enter directory path: ").strip()
    output_dir = input("Enter the folder where renamed files should be saved: ").strip()
    replacement_code = input("Enter the full output JSON filename base (example: referrals_batch_20260323): ").strip()
    referral_replacement_code = input("Enter the starting ReferralNumber value (example: VA0000000001): ").strip()
    ssn_value = input('Enter the SSN value to use (default: 999-99-0001): ').strip() or "999-99-0001"
    clear_output = input("Delete existing files in the save folder first? (y/n): ").strip().lower() == "y"
    keep_processed_json = input("Keep the processed JSON files after creating .gz? (y/n): ").strip().lower() != "n"
    change_list_date = input("Change ListDate values? (y/n): ").strip().lower() == "y"
    list_date_override = None

    if change_list_date:
        list_date_override = input("Enter the new ListDate (YYYY-MM-DD hh:mm:ss): ").strip()
        datetime.strptime(list_date_override, LIST_DATE_FORMAT)
    validate_ssn(ssn_value)
    if referral_replacement_code:
        referral_replacement_code = validate_referral_number_start(referral_replacement_code)

    process_files(
        input_dir=input_dir,
        output_dir=output_dir,
        replacement_code=replacement_code,
        clear_output=clear_output,
        referral_replacement_code=referral_replacement_code,
        list_date_override=list_date_override,
        ssn_value=ssn_value,
        optional_overrides=None,
        keep_processed_json=keep_processed_json,
    )
