const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ccrs", {
  pickDirectory: () => ipcRenderer.invoke("dialog:pick-directory"),
  pickFile: (filters) => ipcRenderer.invoke("dialog:pick-file", filters),
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
  getInfo: () => ipcRenderer.invoke("backend:info"),
  inspectSource: (inputDir) => ipcRenderer.invoke("backend:inspect-source", { inputDir }),
  getPreview: (data) => ipcRenderer.invoke("backend:preview", data),
  importUploadSource: (sourcePath) =>
    ipcRenderer.invoke("backend:import-upload-source", { sourcePath }),
  runJob: (command, data) => ipcRenderer.invoke("backend:run", { command, data }),
  onBackendEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("backend:event", listener);
    return () => ipcRenderer.removeListener("backend:event", listener);
  },
});
