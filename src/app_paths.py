import os
import shutil
import sys


def get_bundle_root():
    meipass_path = getattr(sys, "_MEIPASS", "")
    if meipass_path:
        return meipass_path
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_runtime_root():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def bundle_path(*parts):
    return os.path.join(get_bundle_root(), *parts)


def data_path(*parts):
    return os.path.join(get_runtime_root(), *parts)


def ensure_runtime_files():
    _ensure_directory(data_path("config"))
    _ensure_directory(data_path("upload_import"))
    _ensure_directory(data_path("logs"))
    _ensure_directory(data_path("docs"))
    _ensure_directory(data_path("assets"))
    _ensure_directory(data_path("assets", "icons"))

    _copy_if_missing(bundle_path("config", "mappings.json"), data_path("config", "mappings.json"))
    _copy_if_missing(bundle_path("config", "rules.json"), data_path("config", "rules.json"))
    _copy_if_missing(
        bundle_path("config", "upload_profiles.json"),
        data_path("config", "upload_profiles.json"),
    )
    _copy_if_missing(
        bundle_path("config", "upload_credentials.json"),
        data_path("config", "upload_credentials.json"),
    )
    _copy_if_missing(
        bundle_path("upload_import", "README.txt"),
        data_path("upload_import", "README.txt"),
    )
    _copy_if_missing(
        bundle_path("upload_import", "decrypt-winscp.ps1"),
        data_path("upload_import", "decrypt-winscp.ps1"),
    )
    _copy_if_missing(
        bundle_path("docs", "USER_GUIDE.md"),
        data_path("docs", "USER_GUIDE.md"),
    )
    _copy_if_missing(
        bundle_path("docs", "CCRS_File_Processing_Framework_User_Guide.pdf"),
        data_path("docs", "CCRS_File_Processing_Framework_User_Guide.pdf"),
    )
    _copy_if_missing(
        bundle_path("assets", "icons", "ccrs_app_icon.ico"),
        data_path("assets", "icons", "ccrs_app_icon.ico"),
    )
    _copy_if_missing(
        bundle_path("assets", "icons", "ccrs_app_icon.png"),
        data_path("assets", "icons", "ccrs_app_icon.png"),
    )


def _ensure_directory(path):
    os.makedirs(path, exist_ok=True)


def _copy_if_missing(source, destination):
    if not os.path.exists(source) or os.path.exists(destination):
        return

    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copy2(source, destination)


ensure_runtime_files()
