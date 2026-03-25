import json
import os
import shutil
import sys
import threading
import tkinter as tk
import re
import webbrowser
from datetime import datetime
from tkinter import filedialog, messagebox

import customtkinter as ctk

from app_paths import data_path, ensure_runtime_files
from content_editor import (
    LIST_DATE_FORMAT,
    PAYMENT_AUTHORITY_CODE_LENGTH,
    REFERRAL_NUMBER_PREFIX,
    REFERRAL_NUMBER_DIGIT_COUNT,
    STATION_ID_MAX_LENGTH,
    complete_with_random_suffix,
    extract_json_change_defaults,
    extract_list_date,
    generate_optional_field_overrides,
    generate_referral_number,
    normalize_payment_authority_code,
    normalize_station_id,
    validate_referral_number_start,
    validate_ssn,
)
from file_handler import get_files
from logger import setup_logger
from processor import process_files
from referral_generator import (
    ROTATE_ALL_TEMPLATES,
    build_generated_referral_sources,
    get_referral_template_paths,
)
from renamer import sanitize_filename_base
from uploader import (
    CREDENTIALS_JSON_PATH,
    get_upload_target_names,
    get_upload_profile_source_path,
    get_server_display_for_target,
    get_user_names_for_server,
    import_upload_source_to_config,
    load_upload_profiles,
    resolve_upload_targets,
)
from zipper import DEFAULT_ARCHIVE_BASENAME, sanitize_archive_basename


ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")


THEMES = {
    "Light": {
        "window_bg": "#ECECEC",
        "tab_bg": "#F5F5F7",
        "tab_unselected": "#E7E7EC",
        "tab_unselected_hover": "#DCDCE2",
        "tab_selected": "#007AFF",
        "tab_selected_hover": "#006AE6",
        "card_bg": "#FAFAFC",
        "card_border": "#D6D6DB",
        "content_bg": "#FFFFFF",
        "content_border": "#DEDEE3",
        "hero_bg": "#F5F5F7",
        "hero_border": "#D7D7DC",
        "workflow_bg": "#F8F8FA",
        "workflow_border": "#DEDEE3",
        "secondary_button_bg": "#F2F2F7",
        "secondary_button_hover": "#E6E6EB",
        "secondary_button_border": "#D1D1D6",
        "primary_button_bg": "#007AFF",
        "primary_button_hover": "#006AE6",
        "muted_panel_bg": "#F7F7F9",
        "muted_panel_border": "#DEDEE3",
        "badge_bg": "#EEF5FF",
        "entry_bg": "#FFFFFF",
        "entry_border": "#C7C7CC",
        "option_button": "#E8E8ED",
        "option_button_hover": "#DBDBE0",
        "option_dropdown_hover": "#F2F2F7",
        "divider": "#E5E5EA",
        "date_control_bg": "#F6F6F8",
        "date_control_border": "#D1D1D6",
        "text_primary": "#1C1C1E",
        "text_secondary": "#6E6E73",
        "text_hero": "#1C1C1E",
        "text_hero_subtle": "#636366",
        "text_panel": "#2C2C2E",
        "text_accent": "#007AFF",
        "text_warning": "#B06A3C",
        "text_inverse": "#FFFFFF",
        "text_disabled": "#AEAEB2",
        "status_processing": "#C27C1A",
        "status_success": "#34C759",
        "status_error": "#FF3B30",
    },
    "Dark": {
        "window_bg": "#161618",
        "tab_bg": "#1F2023",
        "tab_unselected": "#2A2A2D",
        "tab_unselected_hover": "#38383C",
        "tab_selected": "#0A84FF",
        "tab_selected_hover": "#409CFF",
        "card_bg": "#1F2023",
        "card_border": "#343438",
        "content_bg": "#2A2A2D",
        "content_border": "#3A3A3C",
        "hero_bg": "#242528",
        "hero_border": "#343438",
        "workflow_bg": "#1F2023",
        "workflow_border": "#343438",
        "secondary_button_bg": "#343438",
        "secondary_button_hover": "#444448",
        "secondary_button_border": "#545458",
        "primary_button_bg": "#0A84FF",
        "primary_button_hover": "#409CFF",
        "muted_panel_bg": "#232427",
        "muted_panel_border": "#343438",
        "badge_bg": "#17324A",
        "entry_bg": "#343438",
        "entry_border": "#545458",
        "option_button": "#444448",
        "option_button_hover": "#545458",
        "option_dropdown_hover": "#343438",
        "divider": "#343438",
        "date_control_bg": "#2A2A2D",
        "date_control_border": "#545458",
        "text_primary": "#F5F5F7",
        "text_secondary": "#AEAEB2",
        "text_hero": "#FFFFFF",
        "text_hero_subtle": "#C7C7CC",
        "text_panel": "#E7E7ED",
        "text_accent": "#5AC8FA",
        "text_warning": "#FF9F0A",
        "text_inverse": "#FFFFFF",
        "text_disabled": "#636366",
        "status_processing": "#FFD60A",
        "status_success": "#30D158",
        "status_error": "#FF453A",
    },
}

THEME_OPTIONS = ["Light", "Dark"]
NETWORK_OPTIONS = ["CCN1", "CCN2", "CCN3", "CCN4", "CCN5"]
UI_SETTINGS_PATH = data_path("config", "ui_settings.json")
APP_ICON_ICO_PATH = data_path("assets", "icons", "ccrs_app_icon.ico")
APP_ICON_PNG_PATH = data_path("assets", "icons", "ccrs_app_icon.png")
USER_GUIDE_PDF_PATH = data_path("docs", "CCRS_File_Processing_Framework_User_Guide.pdf")


class FileProcessorGUI(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("CCRS File Processing Framework")
        self.minsize(920, 660)
        self.after(0, self._set_initial_window_geometry)

        self.ui_settings = self._load_ui_settings()
        self.theme_mode = tk.StringVar(value=self._load_saved_theme_mode())
        self.window_icon_image = None
        self.folder_path = tk.StringVar()
        self.output_path = tk.StringVar()
        self.replacement_code = tk.StringVar()
        self.generator_template_option = tk.StringVar(value=ROTATE_ALL_TEMPLATES)
        self.generator_file_count = tk.StringVar(value="1")
        self.generator_referrals_per_file = tk.StringVar(value="1")
        self.generator_template_summary_text = tk.StringVar(value="Generation setup: 1 file(s) | 1 referral(s) per file | Total referrals: 1")
        self.referral_replacement_code = tk.StringVar()
        self.referral_preview_text = tk.StringVar(value="")
        self.station_id_preview_text = tk.StringVar(value="")
        self.payment_authority_code_preview_text = tk.StringVar(value="")
        self.output_json_preview_text = tk.StringVar(value="")
        self.archive_preview_text = tk.StringVar(value="")
        self.source_status_text = tk.StringVar(value="No source selected")
        self.upload_status_text = tk.StringVar(value="Upload not configured")
        self.summary_source_text = tk.StringVar(value="Source files: none selected")
        self.summary_output_text = tk.StringVar(value="Output JSON: original JSON names")
        self.summary_archive_text = tk.StringVar(value=f"Archive: {DEFAULT_ARCHIVE_BASENAME}.gz")
        self.summary_retention_text = tk.StringVar(value="JSON retention: keep formatted JSON files")
        self.summary_upload_text = tk.StringVar(value="Upload: disabled")
        self._optional_code_preview_cache = {}
        self._is_normalizing_referral_number = False
        self.output_mode = tk.StringVar(value="keep")
        self.keep_processed_json = tk.StringVar(value="yes")
        self.archive_name = tk.StringVar(value=DEFAULT_ARCHIVE_BASENAME)
        self.change_list_date = tk.StringVar(value="no")
        self.ssn_value = tk.StringVar(value="999-99-0001")
        self.show_optional_json_values = tk.StringVar(value="no")
        self.optional_json_fields = {
            "SSN": self.ssn_value,
            "StationID": tk.StringVar(),
            "PaymentAuthorityCode": tk.StringVar(),
            "ReferralPeriod": tk.StringVar(),
            "DOB": tk.StringVar(),
            "Network": tk.StringVar(),
            "ReferralCategory": tk.StringVar(),
            "ReferralDate": tk.StringVar(),
            "ReferralDateTime": tk.StringVar(),
            "ReferralExpirationDate": tk.StringVar(),
            "ReferralLastUpdateDate": tk.StringVar(),
            "ReferralConsultId": tk.StringVar(),
        }
        self.use_upload = tk.StringVar(value="no")
        self.upload_profile_source_text = tk.StringVar(value="")
        self.source_file_count = tk.StringVar(value="No source folder selected.")
        self.list_date_source_value = tk.StringVar(
            value="Default ListDate will appear after you choose a source folder."
        )
        self.current_list_date_value = "0000-00-00 00:00:00"
        self.list_date_year = tk.StringVar(value="0000")
        self.list_date_month = tk.StringVar(value="00")
        self.list_date_day = tk.StringVar(value="00")
        self.list_date_hour = tk.StringVar(value="00")
        self.list_date_minute = tk.StringVar(value="00")
        self.list_date_second = tk.StringVar(value="00")
        self.list_date_entries = {}
        self.upload_profiles = load_upload_profiles()
        self.upload_target_names = get_upload_target_names(self.upload_profiles)
        self.upload_target_enabled = {
            target_name: tk.StringVar(value="no")
            for target_name in self.upload_target_names
        }
        self.upload_target_users = {}
        self.upload_target_paths = {}
        self.optional_value_views = []
        self.upload_views = []
        self.process_run_button = None
        self.generator_run_button = None
        for target_name in self.upload_target_names:
            user_names = get_user_names_for_server(self.upload_profiles, target_name)
            self.upload_target_users[target_name] = tk.StringVar(
                value=user_names[0] if user_names else ""
            )
            self.upload_target_paths[target_name] = tk.StringVar(value="/CCRA_Uploads")

        self.worker_thread = None
        self.status_text = tk.StringVar(value="Status: Idle")
        self.status_details_text = tk.StringVar(
            value="Choose a source folder and output location, then run processing."
        )
        self.generator_status_text = tk.StringVar(value="Status: Idle")
        self.generator_status_details_text = tk.StringVar(
            value="Choose a template, set the counts, then generate files."
        )
        self._refresh_output_job = None
        self._refresh_summary_job = None
        self._cached_source_file_count = 0
        self._apply_theme_mode(self.theme_mode.get())
        self.status_color = self._color("text_panel")
        self.generator_status_color = self._color("text_panel")
        self.configure(fg_color=self._color("window_bg"))
        self._configure_window_icon()
        self.referral_replacement_code.trace_add("write", self._normalize_referral_number_entry)
        self.optional_json_fields["StationID"].trace_add(
            "write",
            lambda *_args: self._normalize_limited_entry(
                self.optional_json_fields["StationID"],
                STATION_ID_MAX_LENGTH,
                normalize_station_id,
            ),
        )
        self.optional_json_fields["PaymentAuthorityCode"].trace_add(
            "write",
            lambda *_args: self._normalize_limited_entry(
                self.optional_json_fields["PaymentAuthorityCode"],
                PAYMENT_AUTHORITY_CODE_LENGTH,
                normalize_payment_authority_code,
            ),
        )
        self.optional_json_fields["StationID"].trace_add("write", self._refresh_optional_code_previews)
        self.optional_json_fields["PaymentAuthorityCode"].trace_add("write", self._refresh_optional_code_previews)
        self.replacement_code.trace_add("write", self._schedule_output_name_refresh)
        self.archive_name.trace_add("write", self._schedule_output_name_refresh)
        self.generator_template_option.trace_add("write", self._refresh_generator_template_summary)
        self.generator_file_count.trace_add("write", self._handle_generator_count_change)
        self.generator_referrals_per_file.trace_add("write", self._handle_generator_count_change)
        self.folder_path.trace_add("write", self._handle_folder_path_change)
        self.output_path.trace_add("write", self._schedule_run_summary_refresh)
        self.keep_processed_json.trace_add("write", self._schedule_run_summary_refresh)
        self.use_upload.trace_add("write", self._schedule_run_summary_refresh)
        self.refresh_upload_profiles()
        self._build_ui()
        self.load_generator_defaults()
        self._refresh_optional_code_previews()

    def _load_ui_settings(self):
        try:
            with open(UI_SETTINGS_PATH, "r", encoding="utf-8") as handle:
                settings = json.load(handle)
                if isinstance(settings, dict):
                    return settings
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass
        return {}

    def _load_saved_theme_mode(self):
        saved_value = self.ui_settings.get("theme_mode", "Light")

        if saved_value not in THEME_OPTIONS:
            return "Light"
        return saved_value

    def _save_ui_settings(self):
        try:
            os.makedirs(os.path.dirname(UI_SETTINGS_PATH), exist_ok=True)
            with open(UI_SETTINGS_PATH, "w", encoding="utf-8") as handle:
                json.dump(self.ui_settings, handle, indent=2)
        except OSError:
            pass

    def _save_theme_mode(self):
        self.ui_settings["theme_mode"] = self.theme_mode.get()
        self._save_ui_settings()

    def _apply_theme_mode(self, selected_theme):
        if selected_theme == "Dark":
            ctk.set_appearance_mode("dark")
        else:
            ctk.set_appearance_mode("light")

    def _configure_window_icon(self):
        try:
            if os.path.exists(APP_ICON_ICO_PATH):
                self.iconbitmap(APP_ICON_ICO_PATH)
        except tk.TclError:
            pass

        try:
            if os.path.exists(APP_ICON_PNG_PATH):
                self.window_icon_image = tk.PhotoImage(file=APP_ICON_PNG_PATH)
                self.iconphoto(True, self.window_icon_image)
        except tk.TclError:
            self.window_icon_image = None

    def _active_theme_name(self):
        return self.theme_mode.get() if self.theme_mode.get() in THEMES else "Light"

    def _build_ui(self):
        for child in self.winfo_children():
            child.destroy()

        self.optional_value_views = []
        self.upload_views = []
        self.process_run_button = None
        self.generator_run_button = None
        self.run_button = None
        self.reset_button = None
        self.status_label = None
        self.generator_status_label = None

        self.configure(fg_color=self._color("window_bg"))
        shell = ctk.CTkFrame(self, fg_color="transparent")
        shell.pack(fill="both", expand=True, padx=28, pady=28)

        self._build_top_toolbar(shell).pack(fill="x", pady=(0, 10))
        self._build_app_hero(shell).pack(fill="x", pady=(0, 16))

        tabview = ctk.CTkTabview(
            shell,
            fg_color=self._color("tab_bg"),
            segmented_button_fg_color=self._color("tab_unselected"),
            segmented_button_selected_color=self._color("tab_selected"),
            segmented_button_selected_hover_color=self._color("tab_selected_hover"),
            segmented_button_unselected_color=self._color("tab_unselected"),
            segmented_button_unselected_hover_color=self._color("tab_unselected_hover"),
            text_color=self._color("text_primary"),
        )
        tabview.pack(fill="both", expand=True)
        tabview._segmented_button.configure(
            height=42,
            font=ctk.CTkFont(size=14, weight="bold"),
        )

        referral_tab = tabview.add("Referral Files")
        additional_tab = tabview.add("Other CCRS File Types")

        self._build_referral_tab(referral_tab)
        self._build_other_files_tab(additional_tab)

    def _color(self, name):
        return THEMES[self._active_theme_name()][name]

    def change_theme(self, selected_theme):
        if selected_theme not in THEME_OPTIONS:
            return
        self.theme_mode.set(selected_theme)
        self._apply_theme_mode(selected_theme)
        self._save_theme_mode()
        self._build_ui()

    def _set_status(self, label_text=None, details_text=None, color=None):
        if label_text is not None:
            self.status_text.set(label_text)
        if details_text is not None:
            self.status_details_text.set(details_text)
        if color is not None:
            self.status_color = color
        if hasattr(self, "status_label"):
            self.status_label.configure(text_color=self.status_color)

    def _set_generator_status(self, label_text=None, details_text=None, color=None):
        if label_text is not None:
            self.generator_status_text.set(label_text)
        if details_text is not None:
            self.generator_status_details_text.set(details_text)
        if color is not None:
            self.generator_status_color = color
        if hasattr(self, "generator_status_label"):
            self.generator_status_label.configure(text_color=self.generator_status_color)

    def _set_run_buttons_state(self, state):
        for button in [self.process_run_button, self.generator_run_button]:
            if button is not None:
                button.configure(state=state)

    def _set_initial_window_geometry(self):
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()

        target_width = min(1320, max(1100, screen_width - 140))
        target_height = min(920, max(760, screen_height - 140))

        if target_width > screen_width:
            target_width = screen_width - 40
        if target_height > screen_height:
            target_height = screen_height - 80

        position_x = max((screen_width - target_width) // 2, 20)
        position_y = max((screen_height - target_height) // 2, 20)
        self.geometry(f"{target_width}x{target_height}+{position_x}+{position_y}")

    def _card(self, parent):
        return ctk.CTkFrame(
            parent,
            corner_radius=22,
            fg_color=self._color("card_bg"),
            border_width=1,
            border_color=self._color("card_border"),
        )

    def _secondary_button(
        self,
        parent,
        text,
        command,
        width=120,
        height=40,
        corner_radius=14,
    ):
        return ctk.CTkButton(
            parent,
            text=text,
            width=width,
            height=height,
            corner_radius=corner_radius,
            fg_color=self._color("secondary_button_bg"),
            hover_color=self._color("secondary_button_hover"),
            text_color=self._color("text_panel"),
            border_width=1,
            border_color=self._color("secondary_button_border"),
            command=command,
        )

    def _accent_button(
        self,
        parent,
        text,
        command,
        width=120,
        height=40,
        corner_radius=14,
    ):
        return ctk.CTkButton(
            parent,
            text=text,
            width=width,
            height=height,
            corner_radius=corner_radius,
            fg_color=self._color("primary_button_bg"),
            hover_color=self._color("primary_button_hover"),
            text_color=self._color("text_inverse"),
            border_width=0,
            command=command,
        )

    def _radio_button(self, parent, text, variable, value):
        return ctk.CTkRadioButton(
            parent,
            text=text,
            variable=variable,
            value=value,
            fg_color=self._color("tab_selected"),
            hover_color=self._color("tab_selected_hover"),
            border_color=self._color("tab_selected"),
            text_color=self._color("text_primary"),
        )

    def _section_header(self, parent, title_text, subtitle_text):
        title = ctk.CTkLabel(
            parent,
            text=title_text,
            anchor="w",
            font=ctk.CTkFont(size=24, weight="bold"),
            text_color=self._color("text_primary"),
        )
        title.pack(anchor="w", padx=22, pady=(20, 4))

        if subtitle_text:
            subtitle = ctk.CTkLabel(
                parent,
                text=subtitle_text,
                anchor="w",
                justify="left",
                wraplength=900,
                font=ctk.CTkFont(size=13),
                text_color=self._color("text_secondary"),
            )
            subtitle.pack(anchor="w", padx=22, pady=(0, 16))

    def _field_label(self, parent, text):
        return ctk.CTkLabel(
            parent,
            text=text,
            anchor="w",
            font=ctk.CTkFont(size=13),
            text_color=self._color("text_secondary"),
        )

    def _format_field_label(self, field_name):
        if field_name == "StationID":
            return "Station ID"
        formatted = re.sub(r"(?<!^)(?=[A-Z])", " ", field_name)
        formatted = formatted.replace(" Id", " ID")
        return formatted

    def _optional_field_placeholder(self, field_name, display_name):
        if field_name == "StationID":
            return (
                f"Leave empty to auto-generate {STATION_ID_MAX_LENGTH} alphanumeric characters, "
                f"or enter up to {STATION_ID_MAX_LENGTH} letters and numbers. Each referral in the file gets a unique Station ID."
            )
        if field_name == "PaymentAuthorityCode":
            return (
                f"Leave empty to auto-generate {PAYMENT_AUTHORITY_CODE_LENGTH} numbers, "
                f"or enter up to {PAYMENT_AUTHORITY_CODE_LENGTH} digits. Each referral in the file gets a unique Payment Authority Code."
            )
        return f"Leave empty to keep the current {display_name}"

    def _normalize_referral_number_entry(self, *_args):
        if self._is_normalizing_referral_number:
            self._refresh_referral_preview()
            return

        raw_value = self.referral_replacement_code.get()
        normalized_value = raw_value
        if normalized_value.startswith(REFERRAL_NUMBER_PREFIX):
            normalized_value = normalized_value[len(REFERRAL_NUMBER_PREFIX):]
        normalized_value = "".join(ch for ch in normalized_value if ch.isalnum())[:REFERRAL_NUMBER_DIGIT_COUNT]
        if normalized_value == raw_value:
            self._refresh_referral_preview()
            return

        self._is_normalizing_referral_number = True
        try:
            self.referral_replacement_code.set(normalized_value)
        finally:
            self._is_normalizing_referral_number = False
        self._refresh_referral_preview()

    def _normalize_limited_entry(self, variable, max_length, normalizer=None):
        raw_value = variable.get()
        normalized_value = normalizer(raw_value) if normalizer else raw_value
        if len(normalized_value) <= max_length and normalized_value == raw_value:
            return
        variable.set(normalized_value[:max_length])

    def _get_stable_optional_preview_value(self, field_name):
        if field_name == "StationID":
            normalized_value = normalize_station_id(self.optional_json_fields[field_name].get() or "")
            target_length = STATION_ID_MAX_LENGTH
            fill_characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        else:
            normalized_value = normalize_payment_authority_code(self.optional_json_fields[field_name].get() or "")
            target_length = PAYMENT_AUTHORITY_CODE_LENGTH
            fill_characters = "0123456789"

        cached_entry = self._optional_code_preview_cache.get(field_name)
        if cached_entry and cached_entry["input"] == normalized_value:
            return cached_entry["value"]

        completed_value = complete_with_random_suffix(normalized_value, target_length, fill_characters)
        self._optional_code_preview_cache[field_name] = {
            "input": normalized_value,
            "value": completed_value,
        }
        return completed_value

    def _refresh_optional_code_previews(self, *_args):
        self.station_id_preview_text.set(
            f"Preview: {self._get_stable_optional_preview_value('StationID')}"
        )
        self.payment_authority_code_preview_text.set(
            f"Preview: {self._get_stable_optional_preview_value('PaymentAuthorityCode')}"
        )

    def _refresh_referral_preview(self):
        raw_value = (self.referral_replacement_code.get() or "").strip()
        if not raw_value:
            self.referral_preview_text.set(
                f"Preview: {REFERRAL_NUMBER_PREFIX}{'0' * REFERRAL_NUMBER_DIGIT_COUNT}"
            )
            return

        try:
            preview_value = generate_referral_number(raw_value, 1, 1)
        except ValueError:
            self.referral_preview_text.set(
                f"Preview: enter up to {REFERRAL_NUMBER_DIGIT_COUNT} letters or numbers"
            )
            return

        self.referral_preview_text.set(f"Preview: {preview_value}")

    def _schedule_output_name_refresh(self, *_args):
        if self._refresh_output_job is not None:
            self.after_cancel(self._refresh_output_job)
        self._refresh_output_job = self.after(60, self._run_scheduled_output_name_refresh)

    def _run_scheduled_output_name_refresh(self):
        self._refresh_output_job = None
        self._refresh_output_name_previews()

    def _schedule_run_summary_refresh(self, *_args):
        if self._refresh_summary_job is not None:
            self.after_cancel(self._refresh_summary_job)
        self._refresh_summary_job = self.after(60, self._run_scheduled_run_summary_refresh)

    def _run_scheduled_run_summary_refresh(self):
        self._refresh_summary_job = None
        self._refresh_run_summary()

    def _handle_folder_path_change(self, *_args):
        folder = self.folder_path.get().strip()
        self._cached_source_file_count = len(get_files(folder)) if folder else 0
        self._schedule_output_name_refresh()
        self._schedule_run_summary_refresh()

    def _handle_generator_count_change(self, *_args):
        self._refresh_generator_template_summary()
        self._schedule_output_name_refresh()

    def _refresh_output_name_previews(self, *_args):
        json_base = sanitize_filename_base(self.replacement_code.get())
        archive_base = sanitize_archive_basename(self.archive_name.get())
        file_count = self._cached_source_file_count
        if file_count == 0:
            try:
                file_count = max(int((self.generator_file_count.get() or "0").strip() or "0"), 0)
            except ValueError:
                file_count = 0

        if json_base:
            if file_count > 1:
                self.output_json_preview_text.set(
                    f"Preview: {json_base}_1.json, {json_base}_2.json, ..."
                )
            else:
                self.output_json_preview_text.set(f"Preview: {json_base}.json")
        else:
            self.output_json_preview_text.set("Preview: original JSON names will be used")

        self.archive_preview_text.set(f"Preview: {archive_base}.gz")
        self._refresh_run_summary()

    def _refresh_run_summary(self, *_args):
        file_count = self._cached_source_file_count
        suffix = "s" if file_count != 1 else ""
        self.summary_source_text.set(
            f"Source files: {file_count} file{suffix}" if file_count else "Source files: none selected"
        )

        json_preview = self.output_json_preview_text.get().replace("Preview: ", "").strip()
        archive_preview = self.archive_preview_text.get().replace("Preview: ", "").strip()
        self.summary_output_text.set(f"Output JSON: {json_preview or 'original JSON names'}")
        self.summary_archive_text.set(f"Archive: {archive_preview or f'{DEFAULT_ARCHIVE_BASENAME}.gz'}")

        if self.keep_processed_json.get() == "yes":
            self.summary_retention_text.set("JSON retention: keep formatted JSON files")
        else:
            self.summary_retention_text.set("JSON retention: keep only the .gz file")

        if self.use_upload.get() != "yes":
            self.summary_upload_text.set("Upload: disabled")
            return

        enabled_targets = [
            target_name
            for target_name in self.upload_target_names
            if self.upload_target_enabled[target_name].get() == "yes"
        ]
        if enabled_targets:
            self.summary_upload_text.set(f"Upload: enabled for {', '.join(enabled_targets)}")
        else:
            self.summary_upload_text.set("Upload: enabled, no target selected yet")

    def _refresh_generator_template_summary(self, *_args):
        file_count = (self.generator_file_count.get() or "").strip() or "1"
        referrals_per_file = (self.generator_referrals_per_file.get() or "").strip() or "1"
        try:
            total_referrals = max(int(file_count), 0) * max(int(referrals_per_file), 0)
        except ValueError:
            total_referrals = 0
        self.generator_template_summary_text.set(
            f"Generation setup: {file_count} file(s) | {referrals_per_file} referral(s) per file | Total referrals: {total_referrals}"
        )

    def _parse_positive_int(self, raw_value, field_name):
        value = int((raw_value or "").strip())
        if value <= 0:
            raise ValueError(f"{field_name} must be greater than zero.")
        return value

    def _build_optional_overrides(self):
        raw_optional_overrides = {}
        for field_name, field_variable in self.optional_json_fields.items():
            value = field_variable.get().strip()
            if field_name in {"StationID", "PaymentAuthorityCode"}:
                if self.show_optional_json_values.get() == "yes":
                    raw_optional_overrides[field_name] = self._get_stable_optional_preview_value(field_name)
                elif value:
                    raw_optional_overrides[field_name] = value
            elif value:
                raw_optional_overrides[field_name] = value
        return generate_optional_field_overrides(raw_optional_overrides)

    def _entry(self, parent, textvariable, placeholder):
        return ctk.CTkEntry(
            parent,
            textvariable=textvariable,
            placeholder_text=placeholder,
            height=40,
            corner_radius=14,
            fg_color=self._color("entry_bg"),
            border_color=self._color("entry_border"),
            text_color=self._color("text_primary"),
        )

    def _inline_field_row(self, parent, label_text, textvariable, placeholder):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=(0, 14))
        row.grid_columnconfigure(1, weight=1)

        label = ctk.CTkLabel(
            row,
            text=label_text,
            anchor="w",
            width=250,
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=self._color("text_primary"),
        )
        label.grid(row=0, column=0, sticky="w", padx=(0, 18))

        entry = self._entry(row, textvariable, placeholder)
        entry.grid(row=0, column=1, sticky="ew")
        return row, entry

    def _inline_option_row(self, parent, label_text, variable, values, command=None):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=(0, 14))
        row.grid_columnconfigure(1, weight=1)

        label = ctk.CTkLabel(
            row,
            text=label_text,
            anchor="w",
            width=250,
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=self._color("text_primary"),
        )
        label.grid(row=0, column=0, sticky="w", padx=(0, 18))

        option_wrap = ctk.CTkFrame(
            row,
            fg_color=self._color("entry_bg"),
            border_width=1,
            border_color=self._color("entry_border"),
            corner_radius=14,
        )
        option_wrap.grid(row=0, column=1, sticky="w")

        option = ctk.CTkOptionMenu(
            option_wrap,
            variable=variable,
            values=values or [""],
            width=240,
            height=40,
            corner_radius=14,
            fg_color=self._color("entry_bg"),
            button_color=self._color("option_button"),
            button_hover_color=self._color("option_button_hover"),
            text_color=self._color("text_primary"),
            dropdown_fg_color=self._color("entry_bg"),
            dropdown_hover_color=self._color("option_dropdown_hover"),
            command=command,
        )
        option.pack(padx=1, pady=1)
        return row, option

    def _build_app_hero(self, parent):
        hero = ctk.CTkFrame(
            parent,
            corner_radius=28,
            fg_color=self._color("hero_bg"),
            border_width=1,
            border_color=self._color("hero_border"),
        )

        title = ctk.CTkLabel(
            hero,
            text="CCRS File Processing",
            anchor="center",
            justify="center",
            font=ctk.CTkFont(size=34, weight="bold"),
            text_color=self._color("text_hero"),
        )
        title.pack(anchor="center", padx=28, pady=(18, 2))

        subtitle = ctk.CTkLabel(
            hero,
            text="Use the tabs below to work with different CCRS file types and processing workflows.",
            wraplength=880,
            justify="center",
            anchor="center",
            font=ctk.CTkFont(size=14),
            text_color=self._color("text_hero_subtle"),
        )
        subtitle.pack(anchor="center", padx=28, pady=(8, 18))
        return hero

    def _build_top_toolbar(self, parent):
        toolbar = ctk.CTkFrame(parent, fg_color="transparent")
        toolbar.grid_columnconfigure(0, weight=1)

        help_button = self._accent_button(
            toolbar,
            "User Guide",
            self.open_user_guide,
            width=140,
            height=38,
            corner_radius=16,
        )
        help_button.grid(row=0, column=0, sticky="w")

        theme_wrap = ctk.CTkFrame(
            toolbar,
            corner_radius=18,
            fg_color=self._color("muted_panel_bg"),
            border_width=1,
            border_color=self._color("muted_panel_border"),
        )
        theme_wrap.grid(row=0, column=1, sticky="e")

        theme_label = ctk.CTkLabel(
            theme_wrap,
            text="Theme",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=self._color("text_secondary"),
        )
        theme_label.pack(side="left", padx=(14, 10), pady=8)

        theme_control = ctk.CTkSegmentedButton(
            theme_wrap,
            values=THEME_OPTIONS,
            variable=self.theme_mode,
            command=self.change_theme,
            height=34,
            corner_radius=17,
            fg_color=self._color("tab_unselected"),
            selected_color=self._color("tab_selected"),
            selected_hover_color=self._color("tab_selected_hover"),
            unselected_color=self._color("tab_unselected"),
            unselected_hover_color=self._color("tab_unselected_hover"),
            text_color=self._color("text_primary"),
            font=ctk.CTkFont(size=12, weight="bold"),
        )
        theme_control.pack(side="left", padx=(0, 8), pady=6)

        return toolbar

    def open_user_guide(self):
        if not os.path.exists(USER_GUIDE_PDF_PATH):
            messagebox.showerror(
                "User Guide",
                f"Could not find the user guide PDF at:\n{USER_GUIDE_PDF_PATH}\n\nRebuild the app with build_release.bat if the guide was not bundled.",
                parent=self,
            )
            return

        try:
            if sys.platform.startswith("win"):
                os.startfile(USER_GUIDE_PDF_PATH)
            else:
                webbrowser.open(f"file://{USER_GUIDE_PDF_PATH}")
        except OSError as error:
            messagebox.showerror(
                "User Guide",
                f"Could not open the user guide PDF.\n\n{error}",
                parent=self,
            )

    def _build_workflow_intro(self, parent, eyebrow_text, title_text, subtitle_text):
        hero = ctk.CTkFrame(
            parent,
            corner_radius=22,
            fg_color=self._color("workflow_bg"),
            border_width=1,
            border_color=self._color("workflow_border"),
        )

        title = ctk.CTkLabel(
            hero,
            text=title_text,
            anchor="center",
            justify="center",
            font=ctk.CTkFont(size=28, weight="bold"),
            text_color=self._color("text_primary"),
        )
        title.pack(anchor="center", padx=28, pady=(18, 0))

        subtitle = ctk.CTkLabel(
            hero,
            text=subtitle_text,
            wraplength=880,
            justify="center",
            anchor="center",
            font=ctk.CTkFont(size=14),
            text_color=self._color("text_secondary"),
        )
        subtitle.pack(anchor="center", padx=28, pady=(8, 18))
        return hero

    def _build_referral_tab(self, parent):
        self.referral_subtabview = ctk.CTkTabview(
            parent,
            fg_color=self._color("tab_bg"),
            segmented_button_fg_color=self._color("tab_unselected"),
            segmented_button_selected_color=self._color("tab_selected"),
            segmented_button_selected_hover_color=self._color("tab_selected_hover"),
            segmented_button_unselected_color=self._color("tab_unselected"),
            segmented_button_unselected_hover_color=self._color("tab_unselected_hover"),
            text_color=self._color("text_primary"),
        )
        self.referral_subtabview.pack(fill="both", expand=True, padx=4, pady=4)
        self.referral_subtabview._segmented_button.configure(
            height=40,
            font=ctk.CTkFont(size=13, weight="bold"),
        )

        edit_tab = self.referral_subtabview.add("Edit Existing Files")
        generator_tab = self.referral_subtabview.add("Generate New Files")

        self._build_referral_edit_tab(edit_tab)
        self._build_referral_generator_tab(generator_tab)
        self.referral_subtabview.set("Edit Existing Files")

    def _build_referral_edit_tab(self, parent):
        self.referral_edit_scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        self.referral_edit_scroll.pack(fill="both", expand=True, padx=4, pady=4)

        self._build_workflow_intro(
            self.referral_edit_scroll,
            "REFERRAL FILE PROCESSING",
            "CCRS Referral Processing",
            "Choose source files, apply targeted JSON updates, and export clean output in one pass.",
        ).pack(fill="x", pady=(0, 16))
        self._build_source_card(self.referral_edit_scroll).pack(fill="x", pady=(0, 16))
        self._build_output_card(self.referral_edit_scroll, workflow_mode="edit").pack(fill="x", pady=(0, 16))
        self._build_code_card(self.referral_edit_scroll, workflow_mode="edit").pack(fill="x", pady=(0, 16))
        self._build_upload_card(self.referral_edit_scroll).pack(fill="x", pady=(0, 16))
        self._build_summary_card(self.referral_edit_scroll).pack(fill="x", pady=(0, 16))
        self._build_footer(self.referral_edit_scroll).pack(fill="x")

    def _build_referral_generator_tab(self, parent):
        self.referral_generator_scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        self.referral_generator_scroll.pack(fill="both", expand=True, padx=4, pady=4)

        self._build_workflow_intro(
            self.referral_generator_scroll,
            "GENERATE REFERRAL FILES",
            "CCRS Referral File Generator",
            "Create new referral JSON files, choose how many files and referrals you want, and apply the same output naming and JSON update rules.",
        ).pack(fill="x", pady=(0, 16))
        self._build_generator_source_card(self.referral_generator_scroll).pack(fill="x", pady=(0, 16))
        self._build_output_card(self.referral_generator_scroll, workflow_mode="generate").pack(fill="x", pady=(0, 16))
        self._build_code_card(self.referral_generator_scroll, workflow_mode="generate").pack(fill="x", pady=(0, 16))
        self._build_upload_card(self.referral_generator_scroll).pack(fill="x", pady=(0, 16))
        self._build_generator_summary_card(self.referral_generator_scroll).pack(fill="x", pady=(0, 16))
        self._build_generator_footer(self.referral_generator_scroll).pack(fill="x")

    def _build_other_files_tab(self, parent):
        card = self._card(parent)
        card.pack(fill="x", padx=8, pady=8)
        self._section_header(
            card,
            "More File Types",
            "This area is reserved for additional CCRS file workflows with their own rules, logic, and processing options.",
        )

        body = ctk.CTkFrame(card, fg_color="transparent")
        body.pack(fill="x", padx=22, pady=(0, 20))

        message = ctk.CTkLabel(
            body,
            text="Referral file processing is available now in the first tab. Future file types can be added here without changing the referral workflow.",
            anchor="w",
            justify="left",
            wraplength=860,
            font=ctk.CTkFont(size=14),
            text_color=self._color("text_secondary"),
        )
        message.pack(anchor="w")

    def _build_generator_source_card(self, parent):
        card = self._card(parent)
        self._section_header(card, "Generator Setup", "Choose how many files and referrals you want to generate.")

        helper_lines = [
            "ListDate is set automatically to the current date and time when you click Generate Files.",
            'SSN defaults to "999-99-0001".',
        ]

        ctk.CTkLabel(
            card,
            text="\n".join(helper_lines),
            anchor="w",
            justify="left",
            wraplength=900,
            font=ctk.CTkFont(size=13),
            text_color=self._color("text_secondary"),
        ).pack(anchor="w", padx=22, pady=(0, 12))

        counts_panel = ctk.CTkFrame(
            card,
            fg_color=self._color("content_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("content_border"),
        )
        counts_panel.pack(fill="x", padx=22, pady=(0, 18))

        counts_body = ctk.CTkFrame(counts_panel, fg_color="transparent")
        counts_body.pack(fill="x", padx=18, pady=18)

        self._inline_field_row(
            counts_body,
            "Files to generate",
            self.generator_file_count,
            "Example: 5",
        )
        self._inline_field_row(
            counts_body,
            "Referrals per file",
            self.generator_referrals_per_file,
            "Example: 3",
        )

        ctk.CTkLabel(
            card,
            textvariable=self.generator_template_summary_text,
            text_color=self._color("text_accent"),
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=self._color("badge_bg"),
            corner_radius=999,
            padx=12,
            pady=6,
        ).pack(anchor="w", padx=22, pady=(0, 20))
        self._refresh_generator_template_summary()
        return card

    def _build_generator_summary_card(self, parent):
        card = self._card(parent)
        self._section_header(card, "Generator Summary", "Review the current generator setup before creating files.")

        summary_panel = ctk.CTkFrame(
            card,
            fg_color=self._color("content_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("content_border"),
        )
        summary_panel.pack(fill="x", padx=22, pady=(0, 20))

        for text_var in [
            self.generator_template_summary_text,
            self.output_json_preview_text,
            self.archive_preview_text,
            self.referral_preview_text,
            self.summary_upload_text,
        ]:
            ctk.CTkLabel(
                summary_panel,
                textvariable=text_var,
                anchor="w",
                justify="left",
                wraplength=900,
                font=ctk.CTkFont(size=13, weight="bold"),
                text_color=self._color("text_panel"),
            ).pack(anchor="w", padx=16, pady=(14 if text_var == self.generator_template_summary_text else 0, 10))

        return card

    def _build_generator_footer(self, parent):
        footer = ctk.CTkFrame(parent, fg_color="transparent")
        footer.pack_propagate(False)
        footer.grid_columnconfigure(2, weight=1)

        self.generator_run_button = ctk.CTkButton(
            footer,
            text="Generate Files",
            width=210,
            height=48,
            corner_radius=20,
            fg_color=self._color("primary_button_bg"),
            hover_color=self._color("primary_button_hover"),
            text_color=self._color("text_inverse"),
            font=ctk.CTkFont(size=15, weight="bold"),
            command=self.run_generator,
        )
        self.generator_run_button.grid(row=0, column=0, sticky="nw", padx=(0, 18))

        reset_button = self._secondary_button(
            footer,
            "Reset Form",
            self.reset_form,
            width=150,
            height=48,
            corner_radius=20,
        )
        reset_button.grid(row=0, column=1, sticky="nw", padx=(0, 18))

        status_card = ctk.CTkFrame(
            footer,
            fg_color=self._color("muted_panel_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("muted_panel_border"),
        )
        status_card.grid(row=0, column=2, sticky="ew")

        self.generator_status_label = ctk.CTkLabel(
            status_card,
            textvariable=self.generator_status_text,
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=self.generator_status_color,
        )
        self.generator_status_label.pack(anchor="w", padx=16, pady=(14, 4))

        self.generator_status_details_label = ctk.CTkLabel(
            status_card,
            textvariable=self.generator_status_details_text,
            justify="left",
            wraplength=860,
            text_color=self._color("text_secondary"),
            font=ctk.CTkFont(size=13),
        )
        self.generator_status_details_label.pack(anchor="w", padx=16, pady=(0, 14))
        return footer

    def _build_source_card(self, parent):
        card = self._card(parent)
        self._section_header(card, "Source", "Pick the folder that contains the incoming JSON files.")

        row = ctk.CTkFrame(card, fg_color="transparent")
        row.pack(fill="x", padx=22, pady=(0, 12))
        row.grid_columnconfigure(0, weight=1)

        source_entry = self._entry(row, self.folder_path, "Select the source folder")
        source_entry.grid(row=0, column=0, sticky="ew", padx=(0, 10))

        browse_button = self._secondary_button(row, "Browse", self.browse_source_folder)
        browse_button.grid(row=0, column=1)

        info_label = ctk.CTkLabel(
            card,
            textvariable=self.source_file_count,
            text_color=self._color("text_accent"),
            font=ctk.CTkFont(size=13, weight="bold"),
            fg_color=self._color("badge_bg"),
            corner_radius=999,
            padx=12,
            pady=6,
        )
        info_label.pack(anchor="w", padx=22, pady=(0, 20))
        self.source_status_label = ctk.CTkLabel(
            card,
            textvariable=self.source_status_text,
            text_color=self._color("text_accent"),
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=self._color("badge_bg"),
            corner_radius=999,
            padx=12,
            pady=6,
        )
        self.source_status_label.pack(anchor="w", padx=22, pady=(0, 20))
        self._refresh_output_name_previews()
        return card

    def _build_output_card(self, parent, workflow_mode="edit"):
        card = self._card(parent)
        if workflow_mode == "generate":
            self._section_header(card, "Output", "Choose where the new referral JSON files should be saved and how the final output should be kept.")
            output_folder_label = "Save generated files to"
            json_name_label = "Name for the generated JSON files"
        else:
            self._section_header(card, "Output", "Choose where the processed JSON files should be saved and how the final output should be kept.")
            output_folder_label = "Save processed files to"
            json_name_label = "Name for the processed JSON files"

        self._field_label(card, output_folder_label).pack(anchor="w", padx=22)

        folder_row = ctk.CTkFrame(card, fg_color="transparent")
        folder_row.pack(fill="x", padx=22, pady=(8, 16))
        folder_row.grid_columnconfigure(0, weight=1)

        output_entry = self._entry(folder_row, self.output_path, "Select the output folder")
        output_entry.grid(row=0, column=0, sticky="ew", padx=(0, 10))

        save_button = self._secondary_button(folder_row, "Save To", self.browse_output_folder)
        save_button.grid(row=0, column=1)

        self._field_label(card, json_name_label).pack(anchor="w", padx=22)
        rename_row = ctk.CTkFrame(card, fg_color="transparent")
        rename_row.pack(fill="x", padx=22, pady=(8, 16))
        rename_row.grid_columnconfigure(0, weight=1)

        self._entry(
            rename_row,
            self.replacement_code,
            "Example: referrals_batch_20260323",
        ).grid(row=0, column=0, sticky="ew")

        self.output_json_preview_label = ctk.CTkLabel(
            card,
            textvariable=self.output_json_preview_text,
            anchor="w",
            justify="left",
            wraplength=860,
            font=ctk.CTkFont(size=12),
            text_color=self._color("text_accent"),
        )
        self.output_json_preview_label.pack(anchor="w", padx=22, pady=(0, 6))
        rename_note = ctk.CTkLabel(
            card,
            text="If you enter a name, the app will create <name>.json for one file, or <name>_1.json, <name>_2.json, and so on for multiple files.",
            anchor="w",
            justify="left",
            wraplength=860,
            font=ctk.CTkFont(size=13),
            text_color=self._color("text_secondary"),
        )
        rename_note.pack(anchor="w", padx=22, pady=(0, 16))

        divider = ctk.CTkFrame(card, height=1, fg_color=self._color("divider"))
        divider.pack(fill="x", padx=22, pady=(0, 16))

        self._field_label(card, "Name for the final .gz file").pack(anchor="w", padx=22)
        archive_row = ctk.CTkFrame(card, fg_color="transparent")
        archive_row.pack(fill="x", padx=22, pady=(8, 16))
        archive_row.grid_columnconfigure(0, weight=1)

        self._entry(
            archive_row,
            self.archive_name,
            "Example: referrals_upload_20260323",
        ).grid(row=0, column=0, sticky="ew")

        self.archive_preview_label = ctk.CTkLabel(
            card,
            textvariable=self.archive_preview_text,
            anchor="w",
            justify="left",
            wraplength=860,
            font=ctk.CTkFont(size=12),
            text_color=self._color("text_accent"),
        )
        self.archive_preview_label.pack(anchor="w", padx=22, pady=(0, 6))
        archive_note = ctk.CTkLabel(
            card,
            text="The app will create <name>.gz and use the matching internal JSON payload name <name>.json.",
            anchor="w",
            justify="left",
            wraplength=860,
            font=ctk.CTkFont(size=13),
            text_color=self._color("text_secondary"),
        )
        archive_note.pack(anchor="w", padx=22, pady=(0, 16))
        self._refresh_output_name_previews()

        divider = ctk.CTkFrame(card, height=1, fg_color=self._color("divider"))
        divider.pack(fill="x", padx=22, pady=(0, 16))

        self._field_label(card, "If save folder already has files").pack(anchor="w", padx=22)
        keep_row = ctk.CTkFrame(card, fg_color="transparent")
        keep_row.pack(fill="x", padx=22, pady=(8, 14))

        self._radio_button(keep_row, "Keep existing files", self.output_mode, "keep").pack(side="left", padx=(0, 18))
        self._radio_button(keep_row, "Delete everything first", self.output_mode, "clear").pack(side="left")

        self._field_label(card, "After creating the .gz file").pack(anchor="w", padx=22)
        json_row = ctk.CTkFrame(card, fg_color="transparent")
        json_row.pack(fill="x", padx=22, pady=(8, 20))

        self._radio_button(json_row, "Keep formatted JSON files", self.keep_processed_json, "yes").pack(side="left", padx=(0, 18))
        self._radio_button(json_row, "Keep only the .gz file", self.keep_processed_json, "no").pack(side="left")
        return card

    def _build_code_card(self, parent, workflow_mode="edit"):
        card = self._card(parent)
        self._section_header(card, "JSON Value Changes", "")

        self.json_values_helper_label = ctk.CTkLabel(
            card,
            text='For each referral file, the app automatically generates a new ICN, FirstName, MiddleName, and LastName. The ICN always starts with "TEST" and is 17 characters long, MiddleName is generated as a single character, and Referral Number, Station ID, and Payment Authority Code can auto-complete and stay unique across referrals inside the same JSON file.',
            anchor="w",
            justify="left",
            wraplength=900,
            font=ctk.CTkFont(size=13),
            text_color=self._color("text_accent"),
        )
        self.json_values_helper_label.pack(anchor="w", padx=22, pady=(0, 6))

        warning_text = (
            "The values shown below come from the selected source JSON files. Update any field you want to change, or leave it as it is."
            if workflow_mode == "edit"
            else "Use the fields below to control values for the generated referral JSON files. Station ID and Payment Authority Code can auto-complete and stay unique for each referral inside a file."
        )
        self.json_values_warning_label = ctk.CTkLabel(
            card,
            text=warning_text,
            anchor="w",
            justify="left",
            wraplength=900,
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color=self._color("text_warning"),
        )
        self.json_values_warning_label.pack(anchor="w", padx=22, pady=(0, 12))

        content = ctk.CTkFrame(
            card,
            fg_color=self._color("content_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("content_border"),
        )
        content.pack(fill="x", padx=22, pady=(0, 20))

        body = ctk.CTkFrame(content, fg_color="transparent")
        body.pack(fill="x", padx=18, pady=18)

        referral_row, _referral_entry = self._inline_field_row(
            body,
            "Referral Number",
            self.referral_replacement_code,
            f"Enter only the number part, for example 1 or {'0' * (REFERRAL_NUMBER_DIGIT_COUNT - 1)}1. The app adds {REFERRAL_NUMBER_PREFIX} automatically and generates the next value for each file.",
        )
        self.referral_preview_label = ctk.CTkLabel(
            referral_row,
            textvariable=self.referral_preview_text,
            anchor="w",
            justify="left",
            font=ctk.CTkFont(size=12),
            text_color=self._color("text_accent"),
        )
        self.referral_preview_label.grid(row=1, column=1, sticky="w", pady=(6, 0))
        self._refresh_referral_preview()

        divider = ctk.CTkFrame(body, height=1, fg_color=self._color("divider"))
        divider.pack(fill="x", pady=(4, 16))

        self._build_date_section(body)

        optional_values_button = self._accent_button(
            body,
            "Show Optional Fields",
            self.toggle_optional_json_fields,
            width=280,
            height=42,
            corner_radius=16,
        )
        optional_values_button.pack(anchor="center", pady=(18, 14))

        optional_values_frame = ctk.CTkFrame(body, fg_color="transparent")
        for field_name, field_variable in self.optional_json_fields.items():
            display_name = self._format_field_label(field_name)
            if field_name == "Network":
                self._inline_option_row(
                    optional_values_frame,
                    display_name,
                    field_variable,
                    [""] + NETWORK_OPTIONS,
                )
            else:
                placeholder = self._optional_field_placeholder(field_name, display_name)
                row, _entry = self._inline_field_row(
                    optional_values_frame,
                    display_name,
                    field_variable,
                    placeholder,
                )
                preview_text = None
                if field_name == "StationID":
                    preview_text = self.station_id_preview_text
                elif field_name == "PaymentAuthorityCode":
                    preview_text = self.payment_authority_code_preview_text

                if preview_text is not None:
                    ctk.CTkLabel(
                        row,
                        textvariable=preview_text,
                        anchor="w",
                        justify="left",
                        font=ctk.CTkFont(size=12),
                        text_color=self._color("text_accent"),
                    ).grid(row=1, column=1, sticky="w", pady=(6, 0))
        self.optional_value_views.append(
            {
                "button": optional_values_button,
                "frame": optional_values_frame,
            }
        )
        return card

    def toggle_optional_json_fields(self):
        is_visible = self.show_optional_json_values.get() == "yes"
        if is_visible:
            for view in self.optional_value_views:
                view["frame"].pack_forget()
                view["button"].configure(text="Show Optional Fields")
            self.show_optional_json_values.set("no")
        else:
            for view in self.optional_value_views:
                view["frame"].pack(fill="x", pady=(0, 14), anchor="center")
                view["button"].configure(text="Hide Optional Fields")
            self.show_optional_json_values.set("yes")

    def _build_upload_card(self, parent):
        card = self._card(parent)
        self._section_header(card, "Upload", "Optionally upload the final .gz file to one or more saved environment profiles.")

        content = ctk.CTkFrame(
            card,
            fg_color=self._color("content_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("content_border"),
        )
        content.pack(fill="x", padx=22, pady=(0, 20))

        body = ctk.CTkFrame(content, fg_color="transparent")
        body.pack(fill="x", padx=18, pady=18)

        toggle_row = ctk.CTkFrame(body, fg_color="transparent")
        toggle_row.pack(fill="x", pady=(0, 14))
        toggle_row.grid_columnconfigure(1, weight=1)

        toggle_label = ctk.CTkLabel(
            toggle_row,
            text="Use upload",
            anchor="w",
            width=250,
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=self._color("text_primary"),
        )
        toggle_label.grid(row=0, column=0, sticky="w", padx=(0, 18))

        self.upload_switch = ctk.CTkSwitch(
            toggle_row,
            text="Upload the .gz file after processing",
            variable=self.use_upload,
            onvalue="yes",
            offvalue="no",
            progress_color=self._color("tab_selected"),
            button_color=self._color("text_inverse"),
            button_hover_color=self._color("text_inverse"),
            text_color=self._color("text_primary"),
            command=self.update_upload_enabled,
        )
        self.upload_switch.grid(row=0, column=1, sticky="w")

        upload_form = ctk.CTkFrame(body, fg_color="transparent")
        upload_form.pack(fill="x")

        source_row = ctk.CTkFrame(upload_form, fg_color="transparent")
        source_row.pack(fill="x", pady=(0, 12))
        source_row.grid_columnconfigure(0, weight=1)

        upload_source_label = ctk.CTkLabel(
            source_row,
            textvariable=self.upload_profile_source_text,
            anchor="w",
            justify="left",
            text_color=self._color("text_secondary"),
            font=ctk.CTkFont(size=13),
        )
        upload_source_label.grid(row=0, column=0, sticky="w", padx=(0, 12))

        self.import_credentials_button = self._accent_button(
            source_row,
            "Import To Config",
            self.import_upload_credentials_json,
            width=220,
            height=38,
            corner_radius=14,
        )
        self.import_credentials_button.grid(row=0, column=1, sticky="e")

        upload_status_label = ctk.CTkLabel(
            upload_form,
            textvariable=self.upload_status_text,
            text_color=self._color("text_accent"),
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=self._color("badge_bg"),
            corner_radius=999,
            padx=12,
            pady=6,
        )
        upload_status_label.pack(anchor="w", pady=(0, 12))

        upload_target_rows = {}
        for target_name in self.upload_target_names:
            target_row = ctk.CTkFrame(
                upload_form,
                fg_color=self._color("muted_panel_bg"),
                corner_radius=18,
                border_width=1,
                border_color=self._color("muted_panel_border"),
            )
            target_row.pack(fill="x", pady=(0, 14))
            target_row.grid_columnconfigure(0, weight=1)
            target_row.grid_columnconfigure(1, weight=1)

            target_label = ctk.CTkLabel(
                target_row,
                text=f"{target_name} Server: {get_server_display_for_target(self.upload_profiles, target_name)}",
                anchor="w",
                font=ctk.CTkFont(size=14, weight="bold"),
                text_color=self._color("text_panel"),
            )
            target_label.grid(row=0, column=0, sticky="w", padx=16, pady=(14, 10))

            target_toggle = ctk.CTkCheckBox(
                target_row,
                text=f"Upload to {target_name}",
                variable=self.upload_target_enabled[target_name],
                onvalue="yes",
                offvalue="no",
                fg_color=self._color("tab_selected"),
                hover_color=self._color("tab_selected_hover"),
                border_color=self._color("tab_selected"),
                checkmark_color=self._color("text_inverse"),
                text_color=self._color("text_primary"),
                command=self.update_upload_enabled,
            )
            target_toggle.grid(row=0, column=1, sticky="e", padx=16, pady=(14, 10))

            target_users = get_user_names_for_server(self.upload_profiles, target_name) or [""]
            target_user_option = ctk.CTkOptionMenu(
                target_row,
                variable=self.upload_target_users[target_name],
                values=target_users,
                width=240,
                height=40,
                corner_radius=14,
                fg_color=self._color("entry_bg"),
                button_color=self._color("option_button"),
                button_hover_color=self._color("option_button_hover"),
                text_color=self._color("text_primary"),
                dropdown_fg_color=self._color("entry_bg"),
                dropdown_hover_color=self._color("option_dropdown_hover"),
            )
            target_user_option.grid(row=1, column=0, sticky="ew", padx=(16, 8), pady=(0, 14))

            target_path_entry = ctk.CTkEntry(
                target_row,
                textvariable=self.upload_target_paths[target_name],
                placeholder_text=f"{target_name} remote path",
                height=40,
                corner_radius=14,
                fg_color=self._color("entry_bg"),
                border_color=self._color("entry_border"),
                text_color=self._color("text_primary"),
            )
            target_path_entry.grid(row=1, column=1, sticky="ew", padx=(8, 16), pady=(0, 14))

            upload_target_rows[target_name] = {
                "toggle": target_toggle,
                "option": target_user_option,
                "path": target_path_entry,
                "label": target_label,
            }

        upload_note_label = ctk.CTkLabel(
            upload_form,
            text="Set upload to yes, then choose any combination of DEV, PPD, and SQA. Click Import To Config and choose either WinSCP.ini or a credentials JSON file. If you choose WinSCP.ini, the app converts it in the backend and saves usable credentials into config/upload_credentials.json automatically.",
            anchor="w",
            justify="left",
            wraplength=860,
            font=ctk.CTkFont(size=13),
            text_color=self._color("text_secondary"),
        )
        upload_note_label.pack(anchor="w")

        self.upload_views.append(
            {
                "form": upload_form,
                "source_label": upload_source_label,
                "status_label": upload_status_label,
                "note_label": upload_note_label,
                "target_rows": upload_target_rows,
            }
        )

        self.update_upload_enabled()
        return card

    def _build_date_section(self, parent):
        title = ctk.CTkLabel(
            parent,
            text="List Date",
            anchor="w",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=self._color("text_primary"),
        )
        title.pack(anchor="w", pady=(0, 8))

        info_block = ctk.CTkFrame(parent, fg_color="transparent")
        info_block.pack(fill="x")

        spinbox_row = ctk.CTkFrame(info_block, fg_color="transparent")
        spinbox_row.pack(fill="x", pady=(0, 0))
        for column in range(6):
            spinbox_row.grid_columnconfigure(column, weight=1)

        self.list_date_controls = []
        self.list_date_entries = {}
        self._build_date_control(spinbox_row, "Year", self.list_date_year, 0, 9999, 0, 4)
        self._build_date_control(spinbox_row, "Month", self.list_date_month, 1, 12, 1, 2)
        self._build_date_control(spinbox_row, "Day", self.list_date_day, 1, 31, 2, 2)
        self._build_date_control(spinbox_row, "Hour", self.list_date_hour, 0, 23, 3, 2)
        self._build_date_control(spinbox_row, "Minute", self.list_date_minute, 0, 59, 4, 2)
        self._build_date_control(spinbox_row, "Second", self.list_date_second, 0, 59, 5, 2)
        self.update_list_date_enabled()

    def _build_summary_card(self, parent):
        card = self._card(parent)
        self._section_header(card, "Summary", "Review the current run setup before processing.")

        summary_panel = ctk.CTkFrame(
            card,
            fg_color=self._color("content_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("content_border"),
        )
        summary_panel.pack(fill="x", padx=22, pady=(0, 20))

        for text_var in [
            self.summary_source_text,
            self.summary_output_text,
            self.summary_archive_text,
            self.summary_retention_text,
            self.summary_upload_text,
        ]:
            ctk.CTkLabel(
                summary_panel,
                textvariable=text_var,
                anchor="w",
                justify="left",
                wraplength=900,
                font=ctk.CTkFont(size=13, weight="bold"),
                text_color=self._color("text_panel"),
            ).pack(anchor="w", padx=16, pady=(14 if text_var == self.summary_source_text else 0, 10))

        self._refresh_run_summary()
        return card

    def _build_footer(self, parent):
        footer = ctk.CTkFrame(parent, fg_color="transparent")
        footer.pack_propagate(False)
        footer.grid_columnconfigure(2, weight=1)

        self.run_button = ctk.CTkButton(
            footer,
            text="Run Processing",
            width=210,
            height=48,
            corner_radius=20,
            fg_color=self._color("primary_button_bg"),
            hover_color=self._color("primary_button_hover"),
            text_color=self._color("text_inverse"),
            font=ctk.CTkFont(size=15, weight="bold"),
            command=self.run_processing,
        )
        self.process_run_button = self.run_button
        self.run_button.grid(row=0, column=0, sticky="nw", padx=(0, 18))

        self.reset_button = self._secondary_button(
            footer,
            "Reset Form",
            self.reset_form,
            width=150,
            height=48,
            corner_radius=20,
        )
        self.reset_button.grid(row=0, column=1, sticky="nw", padx=(0, 18))

        status_card = ctk.CTkFrame(
            footer,
            fg_color=self._color("muted_panel_bg"),
            corner_radius=18,
            border_width=1,
            border_color=self._color("muted_panel_border"),
        )
        status_card.grid(row=0, column=2, sticky="ew")

        self.status_label = ctk.CTkLabel(
            status_card,
            textvariable=self.status_text,
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=self.status_color,
        )
        self.status_label.pack(anchor="w", padx=16, pady=(14, 4))

        self.status_details_label = ctk.CTkLabel(
            status_card,
            textvariable=self.status_details_text,
            justify="left",
            wraplength=860,
            text_color=self._color("text_secondary"),
            font=ctk.CTkFont(size=13),
        )
        self.status_details_label.pack(anchor="w", padx=16, pady=(0, 14))
        return footer

    def browse_source_folder(self):
        folder = filedialog.askdirectory(parent=self)
        if not folder:
            return

        self.folder_path.set(folder)
        files = get_files(folder)
        self._cached_source_file_count = len(files)
        file_count = len(files)
        suffix = "s" if file_count != 1 else ""
        self.source_file_count.set(f"Found {file_count} file{suffix} in the source folder.")
        self.source_status_text.set(
            f"Source ready: {file_count} JSON file{suffix} found" if file_count else "Source selected, no JSON files found"
        )
        self._refresh_output_name_previews()

        self.load_json_change_defaults(files)

        first_list_date = self.get_first_list_date(files)
        if first_list_date:
            self.set_list_date_values(first_list_date)
            self.current_list_date_value = first_list_date
            self.list_date_source_value.set(f"Current default value: {first_list_date}")
        else:
            self._set_date_part_value(self.list_date_year, "0000")
            self._set_date_part_value(self.list_date_month, "00")
            self._set_date_part_value(self.list_date_day, "00")
            self._set_date_part_value(self.list_date_hour, "00")
            self._set_date_part_value(self.list_date_minute, "00")
            self._set_date_part_value(self.list_date_second, "00")
            self.current_list_date_value = "0000-00-00 00:00:00"
            self.list_date_source_value.set("No saved value was found. Showing the default values.")

    def load_json_change_defaults(self, files):
        if not files:
            self._reset_json_change_defaults()
            return

        try:
            defaults = extract_json_change_defaults(sorted(files)[0])
        except (OSError, ValueError, KeyError):
            self._reset_json_change_defaults()
            return

        self.referral_replacement_code.set(defaults.get("ReferralNumber", ""))
        self.ssn_value.set(defaults.get("SSN", "") or "999-99-0001")
        for field_name, field_variable in self.optional_json_fields.items():
            if field_name == "Network":
                field_variable.set("")
            elif field_name in {"StationID", "PaymentAuthorityCode"}:
                field_variable.set("")
            else:
                field_variable.set(defaults.get(field_name, ""))

    def _reset_json_change_defaults(self):
        self.referral_replacement_code.set("")
        self.ssn_value.set("999-99-0001")
        for field_name, field_variable in self.optional_json_fields.items():
            field_variable.set("" if field_name != "SSN" else "999-99-0001")

    def load_generator_defaults(self):
        self._reset_json_change_defaults()

        current_list_date = datetime.now().strftime(LIST_DATE_FORMAT)
        self.set_list_date_values(current_list_date)
        self.current_list_date_value = current_list_date
        self.list_date_source_value.set(
            f"Generator default value: {current_list_date}. The app refreshes this automatically when you click Generate Files."
        )

        template_paths = get_referral_template_paths()
        if not template_paths:
            return

        try:
            defaults = extract_json_change_defaults(template_paths[0])
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            return

        self.referral_replacement_code.set(defaults.get("ReferralNumber", ""))
        self.ssn_value.set("999-99-0001")
        for field_name, field_variable in self.optional_json_fields.items():
            if field_name == "SSN":
                field_variable.set("999-99-0001")
            elif field_name in {"StationID", "PaymentAuthorityCode"}:
                field_variable.set("")
            else:
                field_variable.set(defaults.get(field_name, ""))

    def browse_output_folder(self):
        folder = filedialog.askdirectory(parent=self)
        if not folder:
            return

        self.output_path.set(folder)
        self._refresh_run_summary()

    def refresh_upload_profiles(self):
        self.upload_profiles = load_upload_profiles()
        source_path, source_kind = get_upload_profile_source_path()
        if source_path and source_kind == "credentials_json":
            self.upload_profile_source_text.set(
                f"Upload profile source: Credentials JSON ({source_path}). Edit this config file directly to update hosts, users, or passwords."
            )
            self.upload_status_text.set("Credentials ready from config file")
        elif source_path and source_kind == "decrypt_script":
            self.upload_profile_source_text.set(
                f"Upload profile source: decrypt-winscp.ps1 ({source_path}). The app can use this script when config upload credentials are not available."
            )
            self.upload_status_text.set("Decrypt helper available")
        elif source_path and source_kind == "winscp_ini":
            self.upload_profile_source_text.set(
                f"Upload profile source: WinSCP.ini ({source_path})"
            )
            self.upload_status_text.set("WinSCP.ini detected")
        else:
            self.upload_profile_source_text.set(
                "Upload profile source: none found yet. The app will generate config/upload_credentials.json for you, or it can fall back to WinSCP.ini."
            )
            self.upload_status_text.set("Upload credentials not configured yet")

        for target_name in self.upload_target_names:
            user_names = get_user_names_for_server(self.upload_profiles, target_name)
            current_value = self.upload_target_users[target_name].get().strip()
            new_value = current_value if current_value in user_names else (user_names[0] if user_names else "")
            self.upload_target_users[target_name].set(new_value)

            for view in self.upload_views:
                controls = view["target_rows"].get(target_name)
                if controls:
                    controls["option"].configure(values=user_names or [""])
                    controls["label"].configure(
                        text=f"{target_name} Server: {get_server_display_for_target(self.upload_profiles, target_name)}"
                    )
        self._refresh_run_summary()

    def import_upload_credentials_json(self):
        selected_file = filedialog.askopenfilename(
            parent=self,
            title="Choose WinSCP.ini or credentials JSON",
            filetypes=[("WinSCP or JSON", "WinSCP.ini *.ini *.json"), ("All files", "*.*")],
        )
        if not selected_file:
            return

        try:
            import_result = import_upload_source_to_config(selected_file)
            self.refresh_upload_profiles()
            self.update_upload_enabled()
            if import_result["source_kind"] == "winscp_ini":
                message = (
                    f"Imported WinSCP.ini from:\n{selected_file}\n\n"
                    f"The app converted it in the backend and saved upload credentials to:\n{import_result['config_path']}"
                )
                self.upload_status_text.set("WinSCP.ini imported successfully")
            else:
                message = (
                    f"Imported upload credentials from:\n{selected_file}\n\n"
                    f"Saved to config file:\n{import_result['config_path']}"
                )
                self.upload_status_text.set("Credentials JSON imported successfully")
            messagebox.showinfo(
                "Credentials Imported",
                message,
                parent=self,
            )
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.upload_status_text.set("Upload import failed")
            messagebox.showerror("Error", f"Could not import upload credentials.\n\n{error}", parent=self)

    def update_upload_enabled(self):
        enabled = self.use_upload.get() == "yes"
        state = "normal" if enabled else "disabled"
        text_color = self._color("text_secondary") if enabled else self._color("text_disabled")
        for view in self.upload_views:
            view["note_label"].configure(text_color=text_color)
            for target_name, target_controls in view["target_rows"].items():
                target_controls["toggle"].configure(state=state)
                target_is_enabled = enabled and self.upload_target_enabled[target_name].get() == "yes"
                target_controls["option"].configure(state="normal" if target_is_enabled else "disabled")
                target_controls["path"].configure(state="normal" if target_is_enabled else "disabled")
                target_controls["label"].configure(
                    text_color=self._color("text_panel") if enabled else self._color("text_disabled")
                )
        self._refresh_run_summary()

    def reset_form(self):
        self.folder_path.set("")
        self.output_path.set("")
        self.replacement_code.set("")
        self.generator_template_option.set(ROTATE_ALL_TEMPLATES)
        self.generator_file_count.set("1")
        self.generator_referrals_per_file.set("1")
        self.archive_name.set(DEFAULT_ARCHIVE_BASENAME)
        self.referral_replacement_code.set("")
        self.output_mode.set("keep")
        self.keep_processed_json.set("yes")
        self.use_upload.set("no")
        self.source_file_count.set("No source folder selected.")
        self.source_status_text.set("No source selected")
        self.show_optional_json_values.set("no")
        for view in self.optional_value_views:
            view["frame"].pack_forget()
            view["button"].configure(text="Show Optional Fields")
        for target_name in self.upload_target_names:
            self.upload_target_enabled[target_name].set("no")
            user_names = get_user_names_for_server(self.upload_profiles, target_name)
            self.upload_target_users[target_name].set(user_names[0] if user_names else "")
            self.upload_target_paths[target_name].set("/CCRA_Uploads")
        self.upload_status_text.set("Upload state reset")
        self.load_generator_defaults()
        self._refresh_generator_template_summary()
        self._refresh_referral_preview()
        self._cached_source_file_count = 0
        self._refresh_output_name_previews()
        self.update_upload_enabled()
        self._set_status(
            "Status: Idle",
            "Form reset. Choose a source folder and output location, then run processing.",
            self._color("text_panel"),
        )
        self._set_generator_status(
            "Status: Idle",
            "Form reset. Choose a template, set the counts, then generate files.",
            self._color("text_panel"),
        )

    def get_first_list_date(self, files):
        for file_path in sorted(files):
            list_date = extract_list_date(file_path)
            if list_date:
                return list_date
        return None

    def _build_date_control(self, parent, label_text, variable, from_value, to_value, column, width_chars):
        frame = ctk.CTkFrame(parent, fg_color="transparent")
        frame.grid(
            row=0,
            column=column,
            sticky="ew",
            padx=(0 if column == 0 else 8, 0),
            pady=0,
        )
        frame.grid_columnconfigure(0, weight=1)

        label = ctk.CTkLabel(
            frame,
            text=label_text,
            anchor="center",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color=self._color("text_secondary"),
        )
        label.pack(fill="x", pady=(0, 8))

        control = ctk.CTkFrame(
            frame,
            fg_color=self._color("date_control_bg"),
            border_width=1,
            border_color=self._color("date_control_border"),
            corner_radius=14,
        )
        control.pack(fill="x")
        control.grid_columnconfigure(1, weight=1)

        minus_button = ctk.CTkButton(
            control,
            text="-",
            width=22,
            height=24,
            corner_radius=8,
            fg_color=self._color("option_button"),
            hover_color=self._color("option_button_hover"),
            text_color=self._color("text_primary"),
            font=ctk.CTkFont(size=13, weight="bold"),
            command=lambda: self._activate_and_adjust_date_part(variable, from_value, to_value, width_chars, -1),
        )
        minus_button.grid(row=0, column=0, padx=(6, 4), pady=6)

        value_entry = ctk.CTkEntry(
            control,
            width=86 if width_chars == 2 else 112,
            height=34,
            corner_radius=12,
            fg_color=self._color("entry_bg"),
            border_width=1,
            border_color=self._color("entry_border"),
            text_color=self._color("text_primary"),
            justify="center",
            font=ctk.CTkFont(size=15, weight="bold"),
        )
        value_entry.grid(row=0, column=1, padx=4, pady=6, sticky="ew")
        value_entry.bind("<FocusIn>", lambda _event: self._activate_list_date_editing())
        value_entry.bind("<KeyRelease>", lambda _event, entry=value_entry: self._sync_date_entry(variable, width_chars, entry))
        value_entry.bind(
            "<FocusOut>",
            lambda _event, entry=value_entry: self._normalize_date_entry(variable, from_value, to_value, width_chars, entry),
        )

        plus_button = ctk.CTkButton(
            control,
            text="+",
            width=22,
            height=24,
            corner_radius=8,
            fg_color=self._color("option_button"),
            hover_color=self._color("option_button_hover"),
            text_color=self._color("text_primary"),
            font=ctk.CTkFont(size=13, weight="bold"),
            command=lambda: self._activate_and_adjust_date_part(variable, from_value, to_value, width_chars, 1),
        )
        plus_button.grid(row=0, column=2, padx=(4, 6), pady=6)

        self.list_date_entries.setdefault(str(variable), []).append({
            "entry": value_entry,
            "width_chars": width_chars,
            "from_value": from_value,
            "to_value": to_value,
        })
        self._set_date_part_value(variable, variable.get())
        self.list_date_controls.append((minus_button, plus_button, value_entry))

    def _activate_list_date_editing(self):
        self.update_list_date_enabled()

    def _activate_and_adjust_date_part(self, variable, from_value, to_value, width_chars, delta):
        self._activate_list_date_editing()
        self._adjust_date_part(variable, from_value, to_value, width_chars, delta)

    def _adjust_date_part(self, variable, from_value, to_value, width_chars, delta):
        try:
            current = int(variable.get())
        except ValueError:
            current = from_value

        updated = current + delta
        if updated > to_value:
            updated = from_value
        elif updated < from_value:
            updated = to_value

        self._set_date_part_value(variable, f"{updated:0{width_chars}d}")

    def _set_date_part_value(self, variable, value):
        variable.set(value)
        entry_infos = self.list_date_entries.get(str(variable), [])
        for entry_info in entry_infos:
            entry = entry_info["entry"]
            entry.delete(0, "end")
            entry.insert(0, value)

    def _sync_date_entry(self, variable, width_chars, entry_widget):
        self._activate_list_date_editing()
        if entry_widget is None:
            return

        raw_value = entry_widget.get().strip()
        if raw_value == "":
            variable.set("")
            return

        digits_only = "".join(ch for ch in raw_value if ch.isdigit())
        variable.set(digits_only[:width_chars])

    def _normalize_date_entry(self, variable, from_value, to_value, width_chars, entry_widget):
        if entry_widget is None:
            return

        raw_value = entry_widget.get().strip()
        try:
            normalized = int(raw_value)
        except ValueError:
            normalized = from_value

        if normalized < from_value:
            normalized = from_value
        if normalized > to_value:
            normalized = to_value

        self._set_date_part_value(variable, f"{normalized:0{width_chars}d}")

    def set_list_date_values(self, list_date_text):
        try:
            parsed = datetime.strptime(list_date_text, LIST_DATE_FORMAT)
        except ValueError:
            return

        self._set_date_part_value(self.list_date_year, f"{parsed.year:04d}")
        self._set_date_part_value(self.list_date_month, f"{parsed.month:02d}")
        self._set_date_part_value(self.list_date_day, f"{parsed.day:02d}")
        self._set_date_part_value(self.list_date_hour, f"{parsed.hour:02d}")
        self._set_date_part_value(self.list_date_minute, f"{parsed.minute:02d}")
        self._set_date_part_value(self.list_date_second, f"{parsed.second:02d}")

    def update_list_date_enabled(self):
        for minus_button, plus_button, value_entry in getattr(self, "list_date_controls", []):
            minus_button.configure(
                state="normal",
                fg_color=self._color("option_button"),
                hover_color=self._color("option_button_hover"),
                text_color=self._color("text_primary"),
            )
            plus_button.configure(
                state="normal",
                fg_color=self._color("option_button"),
                hover_color=self._color("option_button_hover"),
                text_color=self._color("text_primary"),
            )
            value_entry.configure(
                state="normal",
                text_color=self._color("text_primary"),
                fg_color=self._color("entry_bg"),
                border_color=self._color("entry_border"),
            )

    def run_processing(self):
        if self.worker_thread is not None:
            messagebox.showinfo("Processing", "A task is already running. Please wait for it to finish.", parent=self)
            return

        input_dir = self.folder_path.get().strip()
        output_dir = self.output_path.get().strip()
        replacement_code = self.replacement_code.get().strip()
        referral_code = self.referral_replacement_code.get().strip()
        ssn_value = self.ssn_value.get().strip()
        try:
            optional_overrides = self._build_optional_overrides()
        except ValueError as error:
            messagebox.showerror("Error", str(error), parent=self)
            return

        if not input_dir:
            messagebox.showerror("Error", "Please select a folder.", parent=self)
            return

        if not output_dir:
            messagebox.showerror("Error", "Please select where to save the files.", parent=self)
            return

        clear_output = self.output_mode.get() == "clear"
        keep_processed_json = self.keep_processed_json.get() == "yes"
        archive_basename = sanitize_archive_basename(self.archive_name.get())
        upload_options = None
        list_date_override = datetime.now().strftime(LIST_DATE_FORMAT)
        self.set_list_date_values(list_date_override)

        try:
            validate_ssn(ssn_value)
        except ValueError as error:
            messagebox.showerror("Error", str(error), parent=self)
            return

        if referral_code:
            try:
                normalized_referral_code = validate_referral_number_start(referral_code)
            except ValueError as error:
                messagebox.showerror("Error", str(error), parent=self)
                return
            self.referral_replacement_code.set(normalized_referral_code)
            referral_code = normalized_referral_code

        if list_date_override == self.current_list_date_value:
            list_date_override = None

        if self.use_upload.get() == "yes":
            try:
                selected_targets = [
                    {
                        "server_name": target_name,
                        "user_name": self.upload_target_users[target_name].get().strip(),
                        "remote_directory": self.upload_target_paths[target_name].get().strip(),
                    }
                    for target_name in self.upload_target_names
                    if self.upload_target_enabled[target_name].get() == "yes"
                ]
                if not selected_targets:
                    raise ValueError("Please select at least one upload environment before using upload.")

                upload_options = {
                    "enabled": True,
                    "targets": resolve_upload_targets(
                        self.upload_profiles,
                        selected_targets,
                    ),
                }
            except ValueError as error:
                messagebox.showerror("Error", str(error), parent=self)
                return

        self._set_status(
            "Status: Processing...",
            "Working through the selected files, applying updates, and preparing the output.",
            self._color("status_processing"),
        )
        self._set_run_buttons_state("disabled")

        self.worker_thread = threading.Thread(
            target=self.process_task,
            args=(
                input_dir,
                output_dir,
                replacement_code,
                clear_output,
                referral_code,
                list_date_override,
                ssn_value,
                optional_overrides,
                keep_processed_json,
                upload_options,
                archive_basename,
            ),
            daemon=True,
        )
        self.worker_thread.start()

    def process_task(
        self,
        input_dir,
        output_dir,
        replacement_code,
        clear_output,
        referral_code,
        list_date_override,
        ssn_value,
        optional_overrides,
        keep_processed_json,
        upload_options,
        archive_basename,
    ):
        try:
            result = process_files(
                input_dir,
                output_dir,
                replacement_code,
                clear_output,
                referral_code,
                list_date_override,
                ssn_value,
                optional_overrides,
                keep_processed_json,
                self.report_progress,
                upload_options,
                archive_basename,
            )
            self.after(0, self.handle_success, result or "Processing completed successfully.")
        except Exception as error:
            self.after(0, self.handle_error, str(error))

    def report_progress(self, current, total, filename, state, upload_target=None):
        if state == "error":
            message = f"Error on file {current} of {total}: {filename}"
        elif state == "uploading":
            if upload_target:
                message = f"Uploading final file to {upload_target} ({current} of {total}): {filename}"
            else:
                message = f"Uploading final file: {filename}"
        else:
            message = f"Processed {current} of {total}: {filename}"
        self.after(0, lambda: self.status_details_text.set(message))

    def handle_success(self, message):
        self._set_run_buttons_state("normal")
        self._set_status("Status: Completed", message, self._color("status_success"))
        self.worker_thread = None

    def handle_error(self, message):
        self._set_run_buttons_state("normal")
        self._set_status("Status: Failed", message, self._color("status_error"))
        self.worker_thread = None
        messagebox.showerror("Error", message, parent=self)

    def run_generator(self):
        if self.worker_thread is not None:
            messagebox.showinfo("Generation", "A task is already running. Please wait for it to finish.", parent=self)
            return

        output_dir = self.output_path.get().strip()
        replacement_code = self.replacement_code.get().strip()
        referral_code = self.referral_replacement_code.get().strip()
        ssn_value = self.ssn_value.get().strip()
        try:
            optional_overrides = self._build_optional_overrides()
        except ValueError as error:
            messagebox.showerror("Error", str(error), parent=self)
            return

        if not output_dir:
            messagebox.showerror("Error", "Please select where to save the generated files.", parent=self)
            return

        try:
            file_count = self._parse_positive_int(self.generator_file_count.get(), "Files to generate")
            referrals_per_file = self._parse_positive_int(self.generator_referrals_per_file.get(), "Referrals per file")
        except ValueError as error:
            messagebox.showerror("Error", str(error), parent=self)
            return

        clear_output = self.output_mode.get() == "clear"
        keep_processed_json = self.keep_processed_json.get() == "yes"
        archive_basename = sanitize_archive_basename(self.archive_name.get())
        upload_options = None
        list_date_override = datetime.now().strftime(LIST_DATE_FORMAT)
        self.set_list_date_values(list_date_override)

        try:
            validate_ssn(ssn_value)
        except ValueError as error:
            messagebox.showerror("Error", str(error), parent=self)
            return

        if referral_code:
            try:
                normalized_referral_code = validate_referral_number_start(referral_code)
            except ValueError as error:
                messagebox.showerror("Error", str(error), parent=self)
                return
            self.referral_replacement_code.set(normalized_referral_code)
            referral_code = normalized_referral_code

        if self.use_upload.get() == "yes":
            try:
                selected_targets = [
                    {
                        "server_name": target_name,
                        "user_name": self.upload_target_users[target_name].get().strip(),
                        "remote_directory": self.upload_target_paths[target_name].get().strip(),
                    }
                    for target_name in self.upload_target_names
                    if self.upload_target_enabled[target_name].get() == "yes"
                ]
                if not selected_targets:
                    raise ValueError("Please select at least one upload environment before using upload.")

                upload_options = {
                    "enabled": True,
                    "targets": resolve_upload_targets(
                        self.upload_profiles,
                        selected_targets,
                    ),
                }
            except ValueError as error:
                messagebox.showerror("Error", str(error), parent=self)
                return

        self._set_generator_status(
            "Status: Generating...",
            f"Creating referral files. ListDate will use the current timestamp: {list_date_override}",
            self._color("status_processing"),
        )
        self._set_run_buttons_state("disabled")

        self.worker_thread = threading.Thread(
            target=self.generate_task,
            args=(
                self.generator_template_option.get(),
                file_count,
                referrals_per_file,
                output_dir,
                replacement_code,
                clear_output,
                referral_code,
                list_date_override,
                ssn_value,
                optional_overrides,
                keep_processed_json,
                upload_options,
                archive_basename,
            ),
            daemon=True,
        )
        self.worker_thread.start()

    def generate_task(
        self,
        template_option,
        file_count,
        referrals_per_file,
        output_dir,
        replacement_code,
        clear_output,
        referral_code,
        list_date_override,
        ssn_value,
        optional_overrides,
        keep_processed_json,
        upload_options,
        archive_basename,
    ):
        generated_input_dir = ""
        try:
            generated_input_dir = build_generated_referral_sources(template_option, file_count, referrals_per_file)
            result = process_files(
                generated_input_dir,
                output_dir,
                replacement_code,
                clear_output,
                referral_code,
                list_date_override,
                ssn_value,
                optional_overrides,
                keep_processed_json,
                self.report_generator_progress,
                upload_options,
                archive_basename,
            )
            self.after(0, self.handle_generator_success, result or "Referral files generated successfully.")
        except Exception as error:
            self.after(0, self.handle_generator_error, str(error))
        finally:
            if generated_input_dir and os.path.isdir(generated_input_dir):
                shutil.rmtree(generated_input_dir, ignore_errors=True)

    def report_generator_progress(self, current, total, filename, state, upload_target=None):
        if state == "error":
            message = f"Error on generated file {current} of {total}: {filename}"
        else:
            message = f"Generated {current} of {total}: {filename}"
        self.after(0, lambda: self.generator_status_details_text.set(message))

    def handle_generator_success(self, message):
        self._set_run_buttons_state("normal")
        self._set_generator_status("Status: Completed", message, self._color("status_success"))
        self.worker_thread = None

    def handle_generator_error(self, message):
        self._set_run_buttons_state("normal")
        self._set_generator_status("Status: Failed", message, self._color("status_error"))
        self.worker_thread = None
        messagebox.showerror("Error", message, parent=self)


def main():
    ensure_runtime_files()
    setup_logger()
    app = FileProcessorGUI()
    app.mainloop()


if __name__ == "__main__":
    main()
