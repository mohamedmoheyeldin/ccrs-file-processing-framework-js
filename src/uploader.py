import configparser
import json
import os
import posixpath
import re
import shutil
import subprocess
import tempfile
from urllib.parse import unquote
from app_paths import data_path


UPLOAD_PROFILES_PATH = data_path("config", "upload_profiles.json")
WINSCP_INI_PATH = data_path("upload_import", "WinSCP.ini")
CREDENTIALS_JSON_PATH = data_path("config", "upload_credentials.json")
DECRYPT_WINSCP_SCRIPT_NAME = "decrypt-winscp.ps1"
WINSCP_GENERATED_CREDENTIALS_PATH = data_path("upload_import", "winscp_credentials.json")


def load_upload_profiles(config_path=UPLOAD_PROFILES_PATH):
    imported_profiles = load_credentials_profiles()
    if imported_profiles["servers"] or imported_profiles["users"]:
        return imported_profiles

    imported_profiles = load_decrypt_script_profiles()
    if imported_profiles["servers"] or imported_profiles["users"]:
        return imported_profiles

    imported_profiles = load_winscp_profiles()
    if imported_profiles["servers"] or imported_profiles["users"]:
        return imported_profiles
    return {"servers": [], "users": []}


def import_upload_source_to_config(source_path):
    source_path = (source_path or "").strip()
    if not source_path or not os.path.exists(source_path):
        raise ValueError("The selected upload source file was not found.")

    extension = os.path.splitext(source_path)[1].lower()
    if extension == ".json":
        profiles = load_credentials_profiles(source_path)
        if not profiles["servers"] or not profiles["users"]:
            raise ValueError("The selected credentials JSON file did not contain usable upload profiles.")

        persist_credentials_json(source_path)
        return {
            "source_kind": "credentials_json",
            "source_path": source_path,
            "config_path": CREDENTIALS_JSON_PATH,
        }

    if extension == ".ini":
        os.makedirs(os.path.dirname(WINSCP_INI_PATH), exist_ok=True)
        shutil.copy2(source_path, WINSCP_INI_PATH)

        script_path = get_existing_decrypt_script_path()
        generated_json_path = run_decrypt_winscp_script(script_path) if script_path else ""
        if not credentials_json_is_usable(generated_json_path):
            generated_json_path = generate_credentials_json_from_winscp_ini(WINSCP_INI_PATH)

        profiles = load_credentials_profiles(generated_json_path)
        if not profiles["servers"] or not profiles["users"]:
            raise ValueError(
                "The selected WinSCP.ini did not contain usable saved sessions with passwords. Export WinSCP.ini from a profile that includes saved sessions, or import a credentials JSON file instead."
            )

        persist_credentials_json(generated_json_path)
        return {
            "source_kind": "winscp_ini",
            "source_path": source_path,
            "config_path": CREDENTIALS_JSON_PATH,
        }

    raise ValueError("Please choose either a WinSCP.ini file or a credentials JSON file.")


def load_credentials_profiles(json_path=CREDENTIALS_JSON_PATH):
    if json_path == CREDENTIALS_JSON_PATH:
        json_path = get_existing_credentials_json_path()
    if not json_path or not os.path.exists(json_path):
        return {"servers": [], "users": []}

    try:
        with open(json_path, "r", encoding="utf-8") as handle:
            entries = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(
            f"Could not read credentials JSON from {json_path}. Please verify the file is valid JSON."
        ) from error

    if isinstance(entries, dict):
        entries = [entries]
    elif not isinstance(entries, list):
        raise ValueError("The credentials JSON file must contain either one credential object or a list of credential objects.")

    servers = {}
    users = {}

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        environment = (entry.get("Environment") or entry.get("environment") or "").strip()
        session_name = (entry.get("Session") or entry.get("session") or "").strip()
        host = (entry.get("Host") or entry.get("host") or "").strip()
        username = (entry.get("UserName") or entry.get("username") or "").strip()
        password = (entry.get("Password") or entry.get("password") or "").strip()
        port = int(entry.get("Port") or entry.get("port") or 22)

        if not host or not username:
            continue

        target_name = infer_upload_target_name(environment, session_name, host, username)
        server_key = target_name or infer_server_name(session_name or username, host)
        display_name = f"{username}@{server_key}"

        if server_key not in servers:
            servers[server_key] = {
                "name": server_key,
                "host": host,
                "port": port,
                "target_name": target_name or "",
                "session_name": session_name,
                "actual_server_name": environment or server_key,
                "source": "credentials_json",
            }

        users[display_name] = {
            "name": display_name,
            "server": server_key,
            "username": username,
            "password": password,
            "encrypted_password": "",
            "password_plain": password,
            "session_name": session_name,
            "target_name": target_name or "",
            "source": "credentials_json",
        }

    return {
        "servers": sorted(servers.values(), key=lambda item: item["name"]),
        "users": sorted(users.values(), key=lambda item: (item["server"], item["name"])),
    }


def credentials_json_is_usable(json_path):
    if not json_path or not os.path.exists(json_path) or os.path.getsize(json_path) == 0:
        return False

    try:
        profiles = load_credentials_profiles(json_path)
    except ValueError:
        return False

    users = profiles.get("users", [])
    if not profiles["servers"] or not users:
        return False

    return any((user.get("password_plain") or user.get("password") or "").strip() for user in users)


def load_decrypt_script_profiles():
    script_path = get_existing_decrypt_script_path()
    if not script_path:
        return {"servers": [], "users": []}

    generated_json_path = run_decrypt_winscp_script(script_path)
    if not credentials_json_is_usable(generated_json_path):
        ini_path = get_existing_winscp_ini_path()
        if not ini_path:
            return {"servers": [], "users": []}
        generated_json_path = generate_credentials_json_from_winscp_ini(ini_path)

    persisted_json_path = persist_credentials_json(generated_json_path)
    return load_credentials_profiles(persisted_json_path)


def persist_credentials_json(source_json_path, destination_path=CREDENTIALS_JSON_PATH):
    if not source_json_path or not os.path.exists(source_json_path):
        raise ValueError("The generated credentials JSON file was not found.")

    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    shutil.copy2(source_json_path, destination_path)

    source_real_path = os.path.normcase(os.path.abspath(source_json_path))
    destination_real_path = os.path.normcase(os.path.abspath(destination_path))
    if source_real_path != destination_real_path:
        try:
            os.remove(source_json_path)
        except OSError:
            pass

    return destination_path


def load_winscp_profiles(ini_path=WINSCP_INI_PATH):
    if ini_path == WINSCP_INI_PATH:
        ini_path = get_existing_winscp_ini_path()
    if not os.path.exists(ini_path):
        return {"servers": [], "users": []}

    parser = configparser.ConfigParser(interpolation=None, strict=False)
    parser.optionxform = str
    read_winscp_ini(parser, ini_path)

    servers = {}
    users = {}

    for section_name in parser.sections():
        if not is_session_section(section_name):
            continue

        session_data = parser[section_name]
        host = session_data.get("HostName", "").strip()
        username = session_data.get("UserName", "").strip()
        if not host or not username:
            continue

        session_name = extract_session_name(section_name)
        server_name = infer_server_name(session_name, host)
        target_name = infer_upload_target_name(session_name, host, server_name)
        port = int(session_data.get("PortNumber", "22") or 22)
        server_key = target_name or server_name

        if server_key not in servers:
            servers[server_key] = {
                "name": server_key,
                "host": host,
                "port": port,
                "target_name": target_name or "",
                "session_name": session_name,
                "actual_server_name": server_name,
                "source": "winscp_ini",
            }

        display_name = build_user_display_name(session_name, username, server_key)
        users[display_name] = {
            "name": display_name,
            "server": server_key,
            "username": username,
            "password": "",
            "encrypted_password": session_data.get("Password", "").strip(),
            "password_plain": session_data.get("PasswordPlain", "").strip(),
            "session_name": session_name,
            "target_name": target_name or "",
            "source": "winscp_ini",
        }

    if not servers and not users:
        extract_profiles_from_host_cache(parser, servers, users)

    return {
        "servers": sorted(servers.values(), key=lambda item: item["name"]),
        "users": sorted(users.values(), key=lambda item: (item["server"], item["name"])),
    }


def read_winscp_ini(parser, ini_path):
    encodings_to_try = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]
    last_error = None

    for encoding in encodings_to_try:
        try:
            with open(ini_path, "r", encoding=encoding, errors="replace") as file:
                content = file.read()

            sanitized_content = sanitize_winscp_ini_content(content)
            parser.read_string(sanitized_content, source=ini_path)
            return
        except (configparser.Error, OSError) as error:
            last_error = error

    raise ValueError(
        f"Could not read WinSCP.ini from {ini_path}. Please verify the file is a valid WinSCP INI export."
    ) from last_error


def decrypt_next_character_winscp(remaining_password, magic=163):
    if len(remaining_password or "") < 2:
        return 0, ""

    added = int(remaining_password[:2], 16)
    decrypted_result = ((~(added ^ magic)) % 256 + 256) % 256
    return decrypted_result, remaining_password[2:]


def decrypt_winscp_password(session_hostname, session_username, encrypted_password):
    check_flag = 255
    key = f"{session_hostname}{session_username}"

    if not encrypted_password:
        return ""

    stored_flag, remaining_password = decrypt_next_character_winscp(encrypted_password)

    if stored_flag == check_flag:
        remaining_password = remaining_password[2:]
        password_length, remaining_password = decrypt_next_character_winscp(remaining_password)
    else:
        password_length, remaining_password = decrypt_next_character_winscp(remaining_password)

    skip_length, remaining_password = decrypt_next_character_winscp(remaining_password)
    remaining_password = remaining_password[skip_length * 2:]

    final_output = []
    for _ in range(password_length):
        decrypted_char, remaining_password = decrypt_next_character_winscp(remaining_password)
        final_output.append(chr(decrypted_char))

    final_password = "".join(final_output)
    if stored_flag == check_flag:
        return final_password[len(key):]
    return final_password


def generate_credentials_json_from_winscp_ini(ini_path, output_path=WINSCP_GENERATED_CREDENTIALS_PATH):
    profiles = load_winscp_profiles(ini_path)
    credentials = []

    for user in profiles.get("users", []):
        encrypted_password = (user.get("encrypted_password") or "").strip()
        if not encrypted_password:
            continue

        server = find_server_for_target(profiles, user.get("server"))
        host = server.get("host", "") if server else ""
        username = user.get("username", "")
        password = decrypt_winscp_password(host, username, encrypted_password)
        if not password or not all(ch.isprintable() for ch in password):
            continue

        credentials.append(
            {
                "Environment": user.get("server", ""),
                "Session": user.get("session_name", "").replace("\\", "/"),
                "UserName": username,
                "Host": host,
                "Password": password,
            }
        )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(credentials, handle, indent=2)

    if not credentials:
        raise ValueError(
            "WinSCP.ini did not contain saved session passwords that could be converted to upload credentials."
        )

    return output_path


def is_session_section(section_name):
    normalized = section_name.replace("/", "\\")
    return normalized.startswith("Sessions\\")


def sanitize_winscp_ini_content(content):
    if not content:
        return ""

    lines = content.splitlines()
    sanitized_lines = []
    in_ini_body = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            in_ini_body = True
            sanitized_lines.append(stripped)
            continue

        if not in_ini_body:
            continue

        if not stripped:
            sanitized_lines.append("")
            continue

        if stripped.startswith(("#", ";")):
            sanitized_lines.append(line)
            continue

        if "=" in line:
            sanitized_lines.append(line)

    return "\n".join(sanitized_lines)


def extract_session_name(section_name):
    normalized = section_name.replace("/", "\\")
    return decode_winscp_session_name(normalized.split("\\", 1)[1])


def decode_winscp_session_name(session_name):
    return unquote(session_name).replace("/", "\\").strip()


def infer_server_name(session_name, host):
    last_segment = session_name.split("\\")[-1]
    if "@" in last_segment:
        return last_segment.split("@", 1)[1].strip() or host

    if "\\" in session_name:
        return session_name.split("\\")[0].strip() or host

    host_prefix = host.split(".", 1)[0].strip()
    return host_prefix.upper() if host_prefix else host


def normalize_upload_target_name(value):
    normalized = (value or "").strip().upper()
    if "PROD" in normalized:
        return "PROD"
    if "SQA" in normalized:
        return "SQA"
    if "DEV" in normalized:
        return "DEV"
    if "PPD" in normalized:
        return "PPD"
    return normalized


def infer_upload_target_name(*values):
    normalized = " ".join((value or "").strip().upper() for value in values if value).strip()
    if not normalized:
        return ""

    alias_groups = {
        "DEV": ["DEV", "DEVELOPMENT", "NONPROD", "NON-PROD", "SANDBOX"],
        "PPD": ["PPD", "PREPROD", "PRE-PROD", "PRE PROD", "STAGE", "STAGING"],
        "SQA": ["SQA", "QA", "TEST", "UAT"],
    }

    for target_name, aliases in alias_groups.items():
        if any(alias in normalized for alias in aliases):
            return target_name

    return normalize_upload_target_name(normalized)


def extract_profiles_from_host_cache(parser, servers, users):
    for section_name in parser.sections():
        section = parser[section_name]
        for key in section.keys():
            username, host = parse_user_host_key(key)
            if not username or not host:
                continue

            target_name = infer_upload_target_name(section_name, key, host)
            if target_name not in get_default_upload_targets():
                continue

            if target_name not in servers:
                servers[target_name] = {
                    "name": target_name,
                    "host": host,
                    "port": 22,
                    "target_name": target_name,
                    "session_name": "",
                    "actual_server_name": host,
                    "source": "winscp_cache",
                }

            display_name = f"{username}@{target_name}"
            if display_name not in users:
                users[display_name] = {
                    "name": display_name,
                    "server": target_name,
                    "username": username,
                    "password": "",
                    "encrypted_password": "",
                    "password_plain": "",
                    "session_name": "",
                    "target_name": target_name,
                    "source": "winscp_cache",
                }


def parse_user_host_key(value):
    match = re.match(r"^\s*([^@\s]+)@([^\s=]+)\s*$", value or "")
    if not match:
        return "", ""
    return match.group(1).strip(), match.group(2).strip()


def build_user_display_name(session_name, username, server_name):
    last_segment = session_name.split("\\")[-1]
    if "@" in last_segment:
        return last_segment
    return f"{username}@{server_name}"


def get_server_names(profiles):
    return [server["name"] for server in profiles.get("servers", [])]


def get_user_names_for_server(profiles, server_name):
    return [
        user["name"]
        for user in profiles.get("users", [])
        if normalize_upload_target_name(user.get("server")) == normalize_upload_target_name(server_name)
    ]


def get_default_upload_targets():
    return ["DEV", "PPD", "SQA"]


def get_upload_target_names(profiles):
    return get_default_upload_targets()


def find_server_for_target(profiles, target_name):
    normalized_target = normalize_upload_target_name(target_name)

    for server in profiles.get("servers", []):
        server_name = server.get("name", "")
        host = server.get("host", "")
        mapped_target = server.get("target_name", "")
        if normalize_upload_target_name(server_name) == normalized_target:
            return server
        if normalize_upload_target_name(host) == normalized_target:
            return server
        if normalize_upload_target_name(mapped_target) == normalized_target:
            return server

    return None


def get_server_display_for_target(profiles, target_name):
    server = find_server_for_target(profiles, target_name)
    if server is None:
        return "No server name available"

    host = (server.get("host") or "").strip()
    actual_name = (server.get("actual_server_name") or "").strip()
    name = (server.get("name") or "").strip()
    if host:
        return host
    if actual_name:
        return actual_name
    return name or "No server name available"


def resolve_upload_profile(profiles, server_name, user_name):
    if normalize_upload_target_name(server_name) == "PROD":
        raise ValueError("Uploads to PROD are disabled in this application.")

    server = next(
        (item for item in profiles.get("servers", []) if item.get("name") == server_name),
        None,
    )
    if server is None:
        server = find_server_for_target(profiles, server_name)
    user = next(
        (
            item
            for item in profiles.get("users", [])
            if item.get("name") == user_name and normalize_upload_target_name(item.get("server")) == normalize_upload_target_name(server_name)
        ),
        None,
    )

    if server is None:
        raise ValueError(f"The selected upload server for {server_name} was not found in WinSCP.ini or config/upload_profiles.json.")

    if user is None:
        raise ValueError(f"The selected upload user for {server_name} was not found in WinSCP.ini or config/upload_profiles.json.")

    if normalize_upload_target_name(user.get("server")) != normalize_upload_target_name(server_name):
        raise ValueError("The selected upload user does not belong to the selected server.")

    password = user.get("password", "")
    password_plain = user.get("password_plain", "")
    password_env = user.get("password_env", "")
    if not password and password_env:
        password = os.getenv(password_env, "")
    if not password and password_plain:
        password = password_plain

    use_winscp_session = user.get("source") == "winscp_ini" and bool(user.get("session_name"))
    if use_winscp_session and not password_plain and not password_env:
        password = ""

    winscp_path = find_winscp_executable()

    if not password:
        if not winscp_path or not user.get("session_name"):
            raise ValueError(
                f"No usable password is configured for {user_name}. Add PasswordPlain/password_env to WinSCP.ini or config/upload_profiles.json, or place/install WinSCP so the app can use the saved session directly."
            )

    return {
        "server_name": server_name,
        "user_name": user_name,
        "host": server.get("host", ""),
        "port": int(server.get("port", 22)),
        "username": user.get("username", ""),
        "password": password,
        "session_name": user.get("session_name", ""),
        "winscp_path": winscp_path,
    }


def resolve_upload_targets(profiles, selected_targets):
    resolved_targets = []

    for target in selected_targets:
        server_name = (target.get("server_name") or "").strip()
        user_name = (target.get("user_name") or "").strip()
        remote_directory = (target.get("remote_directory") or "").strip()
        if not server_name:
            raise ValueError("An upload target is missing its server name.")
        if not user_name:
            raise ValueError(f"Please choose a user for {server_name} before using upload.")
        if not remote_directory:
            raise ValueError(f"Please enter the remote upload location for {server_name}.")

        resolved_targets.append(
            {
                "server_name": server_name,
                "user_name": user_name,
                "remote_directory": remote_directory,
                "connection_details": resolve_upload_profile(profiles, server_name, user_name),
            }
        )

    return resolved_targets


def upload_file(local_path, remote_directory, connection_details):
    remote_directory = (remote_directory or "").strip()
    if not remote_directory:
        raise ValueError("Please enter the remote upload location.")

    winscp_path = connection_details.get("winscp_path", "")
    session_name = connection_details.get("session_name", "")
    password = connection_details.get("password", "")

    if winscp_path and session_name and not password:
        return upload_file_with_winscp(local_path, remote_directory, session_name, winscp_path)

    try:
        import paramiko
    except ModuleNotFoundError as error:
        raise ValueError(
            "Upload support requires the 'paramiko' package. Run run_app.bat again so dependencies can be installed."
        ) from error

    transport = paramiko.Transport((connection_details["host"], connection_details["port"]))
    try:
        transport.connect(
            username=connection_details["username"],
            password=connection_details["password"],
        )
        sftp = paramiko.SFTPClient.from_transport(transport)
        try:
            ensure_remote_directory(sftp, remote_directory)
            remote_path = posixpath.join(remote_directory.rstrip("/"), os.path.basename(local_path))
            sftp.put(local_path, remote_path)
            return remote_path
        finally:
            sftp.close()
    finally:
        transport.close()


def upload_file_with_winscp(local_path, remote_directory, session_name, winscp_path):
    ini_path = get_existing_winscp_ini_path()
    if not ini_path:
        raise ValueError("WinSCP.ini was not found in the expected upload_import locations.")

    script_lines = [
        f'open "{session_name}"',
        f'put "{local_path}" "{remote_directory.rstrip("/")}/"',
        "exit",
    ]

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as script_file:
        script_file.write("\n".join(script_lines))
        script_path = script_file.name

    try:
        result = subprocess.run(
            [winscp_path, f"/ini={ini_path}", f"/script={script_path}", "/nointeractiveinput"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            details = stderr or stdout or "Unknown WinSCP error."
            raise ValueError(f"WinSCP upload failed for session {session_name}. {details}")

        return posixpath.join(remote_directory.rstrip("/"), os.path.basename(local_path))
    finally:
        try:
            os.remove(script_path)
        except OSError:
            pass


def ensure_remote_directory(sftp, remote_directory):
    current_path = ""
    for part in remote_directory.strip("/").split("/"):
        if not part:
            continue
        current_path = f"{current_path}/{part}" if current_path else f"/{part}"
        try:
            sftp.stat(current_path)
        except OSError:
            sftp.mkdir(current_path)


def get_candidate_winscp_ini_paths():
    home_directory = os.path.expanduser("~")
    candidates = [
        WINSCP_INI_PATH,
        os.path.join(os.getcwd(), "upload_import", "WinSCP.ini"),
        os.path.join(os.getcwd(), "upload_import", "winscp.ini"),
        os.path.join(os.path.dirname(data_path("upload_import")), "upload_import", "WinSCP.ini"),
        os.path.join(os.path.dirname(data_path("upload_import")), "upload_import", "winscp.ini"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "upload_import", "WinSCP.ini"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "upload_import", "winscp.ini"),
        os.path.join(home_directory, "AppData", "Roaming", "WinSCP.ini"),
        os.path.join(home_directory, "Downloads", "WinSCP.ini"),
        os.path.join(home_directory, "Downloads", "winscp.ini"),
    ]
    return list(dict.fromkeys(candidates))


def get_candidate_credentials_json_paths():
    home_directory = os.path.expanduser("~")
    candidates = [
        CREDENTIALS_JSON_PATH,
        os.path.join(os.getcwd(), "config", "upload_credentials.json"),
        os.path.join(os.getcwd(), "config", "winscp_credentials.json"),
        os.path.join(os.path.dirname(data_path("config")), "config", "upload_credentials.json"),
        os.path.join(os.path.dirname(data_path("config")), "config", "winscp_credentials.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config", "upload_credentials.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config", "winscp_credentials.json"),
        os.path.join(home_directory, "Downloads", "winscp_credentials.json"),
        os.path.join(home_directory, "Desktop", "winscp_credentials.json"),
        os.path.join(home_directory, "Desktop", "nn", "winscp_credentials.json"),
    ]
    return list(dict.fromkeys(candidates))


def get_candidate_decrypt_script_paths():
    ini_path = get_existing_winscp_ini_path()
    ini_directory = os.path.dirname(ini_path) if ini_path else ""
    candidates = [
        data_path(DECRYPT_WINSCP_SCRIPT_NAME),
        data_path("upload_import", DECRYPT_WINSCP_SCRIPT_NAME),
        os.path.join(os.getcwd(), DECRYPT_WINSCP_SCRIPT_NAME),
        os.path.join(os.getcwd(), "upload_import", DECRYPT_WINSCP_SCRIPT_NAME),
    ]
    if ini_directory:
        candidates.extend(
            [
                os.path.join(ini_directory, DECRYPT_WINSCP_SCRIPT_NAME),
                os.path.join(os.path.dirname(ini_directory), DECRYPT_WINSCP_SCRIPT_NAME),
            ]
        )
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def get_existing_winscp_ini_path():
    for candidate in get_candidate_winscp_ini_paths():
        if os.path.exists(candidate):
            return candidate
    return ""


def get_existing_credentials_json_path():
    for candidate in get_candidate_credentials_json_paths():
        if os.path.exists(candidate):
            return candidate
    return ""


def get_existing_decrypt_script_path():
    for candidate in get_candidate_decrypt_script_paths():
        if os.path.exists(candidate):
            return candidate
    return ""


def run_decrypt_winscp_script(script_path):
    script_directory = os.path.dirname(script_path)
    generated_json_path = os.path.join(script_directory, "winscp_credentials.json")
    try:
        if os.path.exists(generated_json_path):
            os.remove(generated_json_path)
    except OSError:
        pass

    powershell_path = shutil.which("powershell") or shutil.which("pwsh")
    if not powershell_path:
        return generated_json_path if os.path.exists(generated_json_path) else ""

    result = subprocess.run(
        [powershell_path, "-ExecutionPolicy", "Bypass", "-File", script_path],
        cwd=script_directory,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return generated_json_path if os.path.exists(generated_json_path) else ""

    return generated_json_path if os.path.exists(generated_json_path) else ""


def get_upload_profile_source_path():
    credentials_json_path = get_existing_credentials_json_path()
    if credentials_json_path:
        return credentials_json_path, "credentials_json"

    decrypt_script_path = get_existing_decrypt_script_path()
    if decrypt_script_path:
        return decrypt_script_path, "decrypt_script"

    winscp_ini_path = get_existing_winscp_ini_path()
    if winscp_ini_path:
        return winscp_ini_path, "winscp_ini"

    return "", ""


def find_winscp_executable():
    ini_path = get_existing_winscp_ini_path()
    search_roots = []
    if ini_path:
        ini_directory = os.path.dirname(ini_path)
        search_roots.extend(
            [
                ini_directory,
                os.path.dirname(ini_directory),
                os.path.join(ini_directory, "WinSCP"),
            ]
        )

    runtime_root = os.path.dirname(data_path(""))
    search_roots.extend(
        [
            data_path("upload_import"),
            runtime_root,
            os.getcwd(),
            os.path.join(os.getcwd(), "upload_import"),
        ]
    )

    local_candidates = []
    for root in search_roots:
        if not root:
            continue
        local_candidates.extend(
            [
                os.path.join(root, "WinSCP.com"),
                os.path.join(root, "WinSCP.exe"),
                os.path.join(root, "winscp.com"),
                os.path.join(root, "winscp.exe"),
            ]
        )
    for candidate in dict.fromkeys(local_candidates):
        if os.path.exists(candidate):
            return candidate

    executable_names = ["winscp.com", "winscp.exe"]
    for executable_name in executable_names:
        found_path = shutil.which(executable_name)
        if found_path:
            return found_path

    default_paths = [
        r"C:\Program Files (x86)\WinSCP\WinSCP.com",
        r"C:\Program Files\WinSCP\WinSCP.com",
        r"C:\Program Files (x86)\WinSCP\WinSCP.exe",
        r"C:\Program Files\WinSCP\WinSCP.exe",
    ]
    for candidate in default_paths:
        if os.path.exists(candidate):
            return candidate

    return ""
