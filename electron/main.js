const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const backend = require("./backend");

let mainWindow;
const APP_USER_MODEL_ID = "com.ccrs.fileprocessingframework";

async function maybeShowStartupReleaseAnnouncement() {
  let info;
  try {
    info = await backend.handleCommand("info", {});
  } catch (error) {
    console.error("Unable to load startup release announcement info.", error);
    return;
  }

  const announcement = info?.releaseAnnouncement;
  if (!announcement?.releaseKey) {
    return;
  }

  const shouldShow = Boolean(
    announcement.shouldShow ||
      String(announcement.acknowledgedReleaseKey || "").trim() !== String(announcement.releaseKey || "").trim()
  );
  if (!shouldShow) {
    return;
  }

  const notes = Array.isArray(announcement.notes) ? announcement.notes.filter(Boolean) : [];
  const detailText = notes.length
    ? notes.map((note, index) => `${index + 1}. ${note}`).join("\n")
    : "A new release update is available.";

  dialog.showMessageBoxSync({
    type: "info",
    buttons: ["Continue"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Release Update",
    message: `What's new in ${announcement.label || "this release"}`,
    detail: detailText,
  });

  try {
    await backend.handleCommand("acknowledge-release-announcement", {
      releaseKey: announcement.releaseKey,
    });
  } catch (error) {
    console.error("Unable to save startup release announcement acknowledgement.", error);
  }
}

function getWindowsIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "icons", "ccrs_app_icon.ico")
    : path.join(__dirname, "..", "assets", "icons", "ccrs_app_icon.ico");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#ececec",
    icon: getWindowsIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function runBackendCommand(webContents, command, payload = {}) {
  return backend.handleCommand(command, payload, (current, total, filename, state, uploadTarget) => {
    webContents.send("backend:event", {
      type: "progress",
      current,
      total,
      filename,
      state,
      uploadTarget: uploadTarget || null,
    });
  });
}

ipcMain.handle("dialog:pick-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("dialog:pick-file", async (_event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters,
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("shell:open-path", async (_event, targetPath) => {
  if (!targetPath) {
    return "";
  }
  return shell.openPath(targetPath);
});

ipcMain.handle("backend:info", async (event) => runBackendCommand(event.sender, "info"));
ipcMain.handle("backend:inspect-source", async (event, payload) =>
  runBackendCommand(event.sender, "inspect-source", payload)
);
ipcMain.handle("backend:inspect-leie-source", async (event, payload) =>
  runBackendCommand(event.sender, "inspect-leie-source", payload)
);
ipcMain.handle("backend:preview", async (event, payload) => runBackendCommand(event.sender, "preview", payload));
ipcMain.handle("backend:save-ui-settings", async (event, payload) =>
  runBackendCommand(event.sender, "save-ui-settings", payload)
);
ipcMain.handle("backend:acknowledge-release-announcement", async (event, payload) =>
  runBackendCommand(event.sender, "acknowledge-release-announcement", payload)
);
ipcMain.handle("backend:import-upload-source", async (event, payload) =>
  runBackendCommand(event.sender, "import-upload-source", payload)
);
ipcMain.handle("backend:test-upload-target", async (event, payload) =>
  runBackendCommand(event.sender, "test-upload-target", payload)
);
ipcMain.handle("backend:run", async (event, payload) =>
  runBackendCommand(event.sender, payload.command, payload.data)
);

app.whenReady().then(() => {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  try {
    backend.cleanupStaleRuntimeArtifacts();
  } catch (error) {
    console.error("Unable to clean stale runtime artifacts.", error);
  }
  return maybeShowStartupReleaseAnnouncement()
    .catch((error) => {
      console.error("Unable to process startup release announcement.", error);
    })
    .finally(() => {
      createWindow();
    });
}).then(() => {
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  try {
    backend.cleanupRuntimeArtifacts();
  } catch (error) {
    console.error("Unable to clean runtime artifacts before quit.", error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
