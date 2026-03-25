# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
from PyInstaller.building.datastruct import Tree


project_root = Path.cwd()

hiddenimports = [
    "customtkinter",
    "paramiko",
]


a = Analysis(
    ["src/gui.py"],
    pathex=[str(project_root / "src"), str(project_root)],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
a.datas += Tree(str(project_root / "config"), prefix="config")
a.datas += Tree(str(project_root / "docs"), prefix="docs")
a.datas += Tree(str(project_root / "assets"), prefix="assets")
a.datas += Tree(str(project_root / "templates"), prefix="templates")
a.datas += Tree(str(project_root / "upload_import"), prefix="upload_import")

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="CCRS File Processing Framework",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    onefile=True,
    icon=str(project_root / "assets" / "icons" / "ccrs_app_icon.ico"),
)
