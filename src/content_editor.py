import json
import random
import re
from datetime import datetime
from app_paths import data_path

MAPPINGS_PATH = data_path("config", "mappings.json")

try:
    with open(MAPPINGS_PATH, encoding="utf-8") as f:
        mappings = json.load(f)
except FileNotFoundError as error:
    raise FileNotFoundError(
        f"Required config file was not found: {MAPPINGS_PATH}. Rebuild the packaged app so the config folder is included."
    ) from error

LIST_DATE_PATTERN = re.compile(r'("ListDate"\s*:\s*")([^"]+)(")')
SSN_PATTERN = re.compile(r"^\d{3}-\d{2}-\d{4}$")
LIST_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
OPTIONAL_RANDOM_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
NUMERIC_RANDOM_CHARSET = "0123456789"
STATION_ID_MIN_LENGTH = 3
STATION_ID_MAX_LENGTH = 5
PAYMENT_AUTHORITY_CODE_LENGTH = 10
VARIABLE_OVERRIDE_FIELDS = {
    "StationID": {
        "length": STATION_ID_MAX_LENGTH,
        "charset": OPTIONAL_RANDOM_CHARSET,
    },
    "PaymentAuthorityCode": {
        "length": PAYMENT_AUTHORITY_CODE_LENGTH,
        "charset": NUMERIC_RANDOM_CHARSET,
    },
}
FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
]
TRACKED_JSON_FIELDS = [
    "SSN",
    "DOB",
    "Network",
    "StationID",
    "PaymentAuthorityCode",
    "ReferralCategory",
    "ReferralDate",
    "ReferralDateTime",
    "ReferralExpirationDate",
    "ReferralLastUpdateDate",
    "ReferralPeriod",
    "ReferralConsultId",
]
REFERRAL_NUMBER_PREFIX = "VA"
REFERRAL_NUMBER_TOTAL_LENGTH = 12
REFERRAL_NUMBER_DIGIT_COUNT = REFERRAL_NUMBER_TOTAL_LENGTH - len(REFERRAL_NUMBER_PREFIX)
REFERRAL_NUMBER_PATTERN = re.compile(rf"^{REFERRAL_NUMBER_PREFIX}([A-Za-z0-9]{{{REFERRAL_NUMBER_DIGIT_COUNT}}})$")

def extract_list_date(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    match = LIST_DATE_PATTERN.search(content)
    if not match:
        return None

    try:
        datetime.strptime(match.group(2), LIST_DATE_FORMAT)
    except ValueError:
        return None

    return match.group(2)


def extract_json_change_defaults(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    defaults = {field_name: "" for field_name in TRACKED_JSON_FIELDS}
    defaults["ReferralNumber"] = ""
    _collect_first_values(data, defaults)

    referral_number = defaults.get("ReferralNumber", "")
    if referral_number:
        normalized_referral = normalize_referral_number_start(referral_number)
        if normalized_referral:
            defaults["ReferralNumber"] = normalized_referral[len(REFERRAL_NUMBER_PREFIX):]

    return defaults


def _collect_first_values(data, defaults):
    if isinstance(data, dict):
        for key, value in data.items():
            if key in defaults and defaults[key] == "" and not isinstance(value, (dict, list)):
                defaults[key] = str(value)
            _collect_first_values(value, defaults)
    elif isinstance(data, list):
        for item in data:
            _collect_first_values(item, defaults)

def generate_random_icn():
    return "TEST" + "".join(random.choices("0123456789", k=13))


def generate_random_first_name():
    return random.choice(FIRST_NAMES)


def generate_random_last_name():
    return random.choice(LAST_NAMES)


def generate_random_middle_initial():
    return random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def validate_ssn(ssn_value):
    if not SSN_PATTERN.fullmatch((ssn_value or "").strip()):
        raise ValueError("SSN must use the format 999-99-0001.")


def generate_random_code(length):
    return "".join(random.choices(OPTIONAL_RANDOM_CHARSET, k=length))


def generate_random_numeric_code(length):
    return "".join(random.choices(NUMERIC_RANDOM_CHARSET, k=length))


def generate_station_id():
    return generate_random_code(STATION_ID_MAX_LENGTH)


def generate_payment_authority_code():
    return generate_random_numeric_code(PAYMENT_AUTHORITY_CODE_LENGTH)


def normalize_station_id(value):
    return "".join(ch for ch in (value or "").strip() if ch.isalnum())


def normalize_payment_authority_code(value):
    return "".join(ch for ch in (value or "").strip() if ch.isdigit())


def complete_with_random_suffix(value, target_length, fill_characters=OPTIONAL_RANDOM_CHARSET):
    normalized = (value or "").strip()
    if len(normalized) >= target_length:
        return normalized[:target_length]
    return normalized + "".join(random.choices(fill_characters, k=target_length - len(normalized)))


def encode_sequence_value(number, charset):
    if number <= 0:
        return charset[0]

    base = len(charset)
    encoded = []
    current = number
    while current > 0:
        current, remainder = divmod(current, base)
        encoded.append(charset[remainder])
    return "".join(reversed(encoded))


def generate_unique_field_value(base_value, sequence_index, total_length, charset):
    normalized = (base_value or "").strip()
    if not normalized:
        normalized = "".join(random.choices(charset, k=total_length))
    normalized = normalized[:total_length]

    if (sequence_index or 1) <= 1:
        return normalized

    sequence_offset = (sequence_index or 1) - 1
    while True:
        suffix = encode_sequence_value(sequence_offset, charset)
        if len(suffix) >= total_length:
            candidate = suffix[-total_length:]
        else:
            prefix = normalized[:total_length - len(suffix)]
            candidate = f"{prefix}{suffix}"

        if candidate != normalized:
            return candidate
        sequence_offset += 1


def get_station_id_sequence_charset(base_value):
    normalized = normalize_station_id(base_value)
    if normalized and normalized[-1].isalpha():
        return NUMERIC_RANDOM_CHARSET
    if normalized and normalized[-1].isdigit():
        return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return OPTIONAL_RANDOM_CHARSET


def validate_station_id(value):
    normalized = normalize_station_id(value)
    if len(normalized) > STATION_ID_MAX_LENGTH:
        raise ValueError(f"Station ID must be {STATION_ID_MAX_LENGTH} characters or less.")
    return complete_with_random_suffix(normalized, STATION_ID_MAX_LENGTH)


def validate_payment_authority_code(value):
    normalized = normalize_payment_authority_code(value)
    if len(normalized) > PAYMENT_AUTHORITY_CODE_LENGTH:
        raise ValueError(
            f"Payment Authority Code must be {PAYMENT_AUTHORITY_CODE_LENGTH} characters or less."
        )
    return complete_with_random_suffix(
        normalized,
        PAYMENT_AUTHORITY_CODE_LENGTH,
        NUMERIC_RANDOM_CHARSET,
    )


def generate_optional_field_overrides(raw_overrides):
    raw_overrides = raw_overrides or {}
    overrides = {}
    for key, value in raw_overrides.items():
        normalized_value = (value or "").strip()
        if key not in {"StationID", "PaymentAuthorityCode"} and normalized_value:
            overrides[key] = normalized_value

    if "StationID" in raw_overrides:
        overrides["StationID"] = validate_station_id(raw_overrides.get("StationID", ""))
    if "PaymentAuthorityCode" in raw_overrides:
        overrides["PaymentAuthorityCode"] = validate_payment_authority_code(raw_overrides.get("PaymentAuthorityCode", ""))
    return overrides


def normalize_referral_number_start(value):
    normalized = (value or "").strip()
    if not normalized:
        return ""

    if normalized.startswith(REFERRAL_NUMBER_PREFIX):
        normalized = normalized[len(REFERRAL_NUMBER_PREFIX):]

    normalized = "".join(ch for ch in normalized if ch.isalnum())
    if not normalized:
        return ""

    direct_match = REFERRAL_NUMBER_PATTERN.fullmatch(normalized)
    if direct_match:
        return normalized

    if len(normalized) > REFERRAL_NUMBER_DIGIT_COUNT:
        return f"{REFERRAL_NUMBER_PREFIX}{normalized[:REFERRAL_NUMBER_DIGIT_COUNT]}"

    return f"{REFERRAL_NUMBER_PREFIX}{normalized.rjust(REFERRAL_NUMBER_DIGIT_COUNT, '0')}"


def validate_referral_number_start(value):
    normalized = normalize_referral_number_start(value)
    if not normalized:
        raise ValueError(
            f"Enter only the number part of Referral Number. The app adds {REFERRAL_NUMBER_PREFIX} automatically and fills missing digits, for example 1 becomes {REFERRAL_NUMBER_PREFIX}{'0' * (REFERRAL_NUMBER_DIGIT_COUNT - 1)}1."
        )

    body_only = (value or "").strip()
    if body_only.startswith(REFERRAL_NUMBER_PREFIX):
        body_only = body_only[len(REFERRAL_NUMBER_PREFIX):]
    body_only = "".join(ch for ch in body_only if ch.isalnum())
    if len(body_only) > REFERRAL_NUMBER_DIGIT_COUNT:
        raise ValueError(
            f"Enter up to {REFERRAL_NUMBER_DIGIT_COUNT} letters or numbers for Referral Number. The app adds {REFERRAL_NUMBER_PREFIX} automatically."
        )

    return normalized


def fit_referral_body(base_value, available_length):
    if available_length <= 0:
        raise ValueError("Referral Number does not have enough room for the generated sequence.")

    padded_value = (base_value or "").rjust(REFERRAL_NUMBER_DIGIT_COUNT, "0")
    return padded_value[-available_length:]


def generate_referral_number(start_value, sequence_index, total_values=1):
    normalized_start = validate_referral_number_start(start_value)
    normalized_body = normalized_start[len(REFERRAL_NUMBER_PREFIX):]
    offset = max((sequence_index or 1) - 1, 0)

    if normalized_body.isdigit():
        base_number = int(normalized_body)
        generated_number = base_number + offset
        upper_bound = 10 ** REFERRAL_NUMBER_DIGIT_COUNT
        if generated_number >= upper_bound:
            raise ValueError(
                f"Referral Number range exceeded. The largest supported value is {REFERRAL_NUMBER_PREFIX}{'9' * REFERRAL_NUMBER_DIGIT_COUNT}."
            )
        return f"{REFERRAL_NUMBER_PREFIX}{generated_number:0{REFERRAL_NUMBER_DIGIT_COUNT}d}"

    suffix_match = re.search(r"(\d+)$", normalized_body)
    if suffix_match:
        suffix_digits = suffix_match.group(1)
        prefix_part = normalized_body[:-len(suffix_digits)]
        incremented_suffix = str(int(suffix_digits) + offset)
        if len(incremented_suffix) >= REFERRAL_NUMBER_DIGIT_COUNT:
            raise ValueError("Referral Number range exceeded for the selected files.")

        max_prefix_length = REFERRAL_NUMBER_DIGIT_COUNT - len(incremented_suffix)
        if max_prefix_length <= 0:
            raise ValueError("Referral Number prefix is too long for the available length.")

        adjusted_prefix = fit_referral_body(prefix_part, max_prefix_length)
        available_suffix_length = REFERRAL_NUMBER_DIGIT_COUNT - len(adjusted_prefix)
        return f"{REFERRAL_NUMBER_PREFIX}{adjusted_prefix}{incremented_suffix.zfill(available_suffix_length)}"

    if (sequence_index or 1) == 1:
        return f"{REFERRAL_NUMBER_PREFIX}{normalized_body}"

    sequence_suffix = str(max(sequence_index or 1, 1))
    prefix_length = REFERRAL_NUMBER_DIGIT_COUNT - len(sequence_suffix)
    if prefix_length <= 0:
        raise ValueError("Too many files were selected for the available Referral Number length.")

    body_prefix = fit_referral_body(normalized_body, prefix_length)
    return f"{REFERRAL_NUMBER_PREFIX}{body_prefix}{sequence_suffix}"


def update_patient_identity(data, ssn_value):
    if isinstance(data, dict):
        if all(key in data for key in ["ICN", "FirstName", "LastName", "SSN"]):
            data["ICN"] = generate_random_icn()
            data["FirstName"] = generate_random_first_name()
            data["LastName"] = generate_random_last_name()
            if "MiddleName" in data:
                data["MiddleName"] = generate_random_middle_initial()
            data["SSN"] = ssn_value

        for value in data.values():
            update_patient_identity(value, ssn_value)

    elif isinstance(data, list):
        for item in data:
            update_patient_identity(item, ssn_value)


def apply_optional_overrides(data, overrides):
    variable_override_counts = {field_name: 0 for field_name in VARIABLE_OVERRIDE_FIELDS}
    variable_override_used_values = {field_name: set() for field_name in VARIABLE_OVERRIDE_FIELDS}

    def _apply(current_data):
        if isinstance(current_data, dict):
            for key, value in list(current_data.items()):
                if key in overrides:
                    if key in VARIABLE_OVERRIDE_FIELDS:
                        field_settings = VARIABLE_OVERRIDE_FIELDS[key]
                        sequence_charset = field_settings["charset"]
                        if key == "StationID":
                            sequence_charset = get_station_id_sequence_charset(overrides[key])
                        while True:
                            variable_override_counts[key] += 1
                            candidate_value = generate_unique_field_value(
                                overrides[key],
                                variable_override_counts[key],
                                field_settings["length"],
                                sequence_charset,
                            )
                            if candidate_value not in variable_override_used_values[key]:
                                variable_override_used_values[key].add(candidate_value)
                                current_data[key] = candidate_value
                                break
                    else:
                        current_data[key] = overrides[key]
                else:
                    _apply(value)

        elif isinstance(current_data, list):
            for item in current_data:
                _apply(item)

    _apply(data)


def apply_referral_number_override(data, start_value, sequence_start=1):
    replacements_used = 0

    if isinstance(data, dict):
        for key, value in list(data.items()):
            if key == "ReferralNumber" and not isinstance(value, (dict, list)):
                data[key] = generate_referral_number(start_value, sequence_start + replacements_used)
                replacements_used += 1
            else:
                replacements_used += apply_referral_number_override(value, start_value, sequence_start + replacements_used)

    elif isinstance(data, list):
        for item in data:
            replacements_used += apply_referral_number_override(item, start_value, sequence_start + replacements_used)

    return replacements_used


def modify_content(
    filepath,
    referral_replacement_code=None,
    list_date_override=None,
    ssn_value="999-99-0001",
    file_index=None,
    total_files=1,
    optional_overrides=None,
    referral_sequence_start=1,
):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    for key, value in mappings.items():
        content = content.replace(key, value)

    if list_date_override:
        content = LIST_DATE_PATTERN.sub(
            lambda match: f"{match.group(1)}{list_date_override}{match.group(3)}",
            content
        )

    validate_ssn(ssn_value)
    data = json.loads(content)
    referral_numbers_used = 0
    if referral_replacement_code:
        referral_numbers_used = apply_referral_number_override(data, referral_replacement_code, referral_sequence_start)
    update_patient_identity(data, ssn_value.strip())
    if optional_overrides:
        apply_optional_overrides(data, optional_overrides)
    return json.dumps(data, indent=4), referral_numbers_used
