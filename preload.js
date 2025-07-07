const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectFile: () => ipcRenderer.invoke("select-file"),
  previewExcel: (filePath) => ipcRenderer.invoke("preview-excel", filePath),
  processExcel: (filePath) => ipcRenderer.invoke("process-excel", filePath),
});