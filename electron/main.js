const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#f4efe6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function getProjectRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

function resolveBackendLaunch(command) {
  const projectRoot = getProjectRoot();

  if (app.isPackaged) {
    return {
      executable: path.join(process.resourcesPath, "backend", "ccrs_backend.exe"),
      args: [command],
    };
  }

  const compiledBackend = path.join(projectRoot, "dist-python", "ccrs_backend.exe");
  if (fs.existsSync(compiledBackend)) {
    return {
      executable: compiledBackend,
      args: [command],
    };
  }

  const scriptPath = path.join(projectRoot, "src", "backend_api.py");
  if (process.platform === "win32") {
    return {
      executable: "py",
      args: ["-3", scriptPath, command],
    };
  }

  return {
    executable: "python3",
    args: [scriptPath, command],
  };
}

function runBackendCommand(webContents, command, payload = {}) {
  return new Promise((resolve, reject) => {
    const launch = resolveBackendLaunch(command);
    const child = spawn(launch.executable, launch.args, {
      cwd: getProjectRoot(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let settled = false;

    const settle = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      fn(value);
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const message = JSON.parse(line);
          webContents.send("backend:event", message);

          if (message.type === "result") {
            settle(resolve, message.data);
          } else if (message.type === "error") {
            settle(reject, new Error(message.message || "Backend command failed."));
          }
        } catch (_error) {
          stderrBuffer += `\nFailed to parse backend output: ${line}`;
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    child.on("error", (error) => {
      settle(reject, error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      if (stdoutBuffer.trim()) {
        try {
          const message = JSON.parse(stdoutBuffer.trim());
          webContents.send("backend:event", message);
          if (message.type === "result") {
            settle(resolve, message.data);
            return;
          }
          if (message.type === "error") {
            settle(reject, new Error(message.message || "Backend command failed."));
            return;
          }
        } catch (_error) {
          stderrBuffer += `\n${stdoutBuffer.trim()}`;
        }
      }

      const errorMessage = stderrBuffer.trim() || `Backend exited with code ${code}.`;
      settle(reject, new Error(errorMessage));
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
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
ipcMain.handle("backend:import-upload-source", async (event, payload) =>
  runBackendCommand(event.sender, "import-upload-source", payload)
);
ipcMain.handle("backend:run", async (event, payload) =>
  runBackendCommand(event.sender, payload.command, payload.data)
);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
