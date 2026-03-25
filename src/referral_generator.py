import copy
import json
import os
import tempfile

from app_paths import bundle_path


TEMPLATE_DIRECTORY = bundle_path("templates", "referrals")
ROTATE_ALL_TEMPLATES = "Rotate bundled examples"


def get_referral_template_paths():
    if not os.path.isdir(TEMPLATE_DIRECTORY):
        return []

    return sorted(
        os.path.join(TEMPLATE_DIRECTORY, name)
        for name in os.listdir(TEMPLATE_DIRECTORY)
        if os.path.isfile(os.path.join(TEMPLATE_DIRECTORY, name)) and name.lower().endswith(".json")
    )


def get_referral_template_options():
    template_paths = get_referral_template_paths()
    options = [ROTATE_ALL_TEMPLATES]
    options.extend(os.path.basename(path) for path in template_paths)
    return options


def get_referral_template_label(option_value):
    if option_value == ROTATE_ALL_TEMPLATES:
        return "Rotate bundled examples"
    return option_value or "Rotate bundled examples"


def get_referral_template_metadata():
    metadata = []
    for path in get_referral_template_paths():
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)

        referrals = data.get("Referrals", []) if isinstance(data, dict) else []
        first_referral = referrals[0] if referrals else {}
        metadata.append(
            {
                "name": os.path.basename(path),
                "path": path,
                "referral_count": len(referrals),
                "network": first_referral.get("Network", ""),
                "category": first_referral.get("ReferralCategory", ""),
            }
        )
    return metadata


def build_generated_referral_sources(template_option, file_count, referrals_per_file):
    template_paths = get_referral_template_paths()
    if not template_paths:
        raise ValueError("No bundled referral templates were found. Rebuild the app so the templates folder is included.")

    if file_count <= 0:
        raise ValueError("Enter a file count greater than zero.")

    if referrals_per_file <= 0:
        raise ValueError("Enter a referral count greater than zero.")

    selected_paths = template_paths
    if template_option and template_option != ROTATE_ALL_TEMPLATES:
        selected_paths = [
            path for path in template_paths if os.path.basename(path) == template_option
        ]
        if not selected_paths:
            raise ValueError("The selected referral template was not found.")

    generated_directory = tempfile.mkdtemp(prefix="ccrs_referral_generator_")

    for file_index in range(file_count):
        template_path = selected_paths[file_index % len(selected_paths)]
        with open(template_path, "r", encoding="utf-8") as handle:
            template_data = json.load(handle)

        referrals = template_data.get("Referrals", []) if isinstance(template_data, dict) else []
        if not referrals:
            raise ValueError(f"The selected template does not contain any Referrals: {os.path.basename(template_path)}")

        generated_data = copy.deepcopy(template_data)
        generated_referrals = []
        for referral_index in range(referrals_per_file):
            generated_referrals.append(copy.deepcopy(referrals[referral_index % len(referrals)]))
        generated_data["Referrals"] = generated_referrals

        generated_name = f"generated_template_{file_index + 1}.json"
        output_path = os.path.join(generated_directory, generated_name)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(generated_data, handle, indent=4)

    return generated_directory
