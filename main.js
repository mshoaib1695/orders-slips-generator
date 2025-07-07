const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");

const {
  generatePDF,
  generateChecklistPDF,
  getUniqueFolderPath,
  getDate,
} = require("./helpers");

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  win.loadFile("index.html");
}

function getLastTrackingNumber() {
  try {
    const TRACKING_FILE = path.join(
      app.getPath("userData"),
      "lastTracking.txt"
    );
    const content = fs.readFileSync(TRACKING_FILE, "utf-8").trim();
    return parseInt(content, 10) || 10000;
  } catch {
    return 10000;
  }
}

function saveLastTrackingNumber(num) {
  const TRACKING_FILE = path.join(app.getPath("userData"), "lastTracking.txt");
  fs.mkdirSync(path.dirname(TRACKING_FILE), { recursive: true });
  fs.writeFileSync(TRACKING_FILE, String(num));
}

app.whenReady().then(createWindow);

ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Excel File",
    properties: ["openFile"],
    filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("preview-excel", (_, filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  return data.slice(0, 50); // just preview first 50 rows
});

ipcMain.handle("process-excel", async (_, filePath) => {
  console.log("📥 Received path:", filePath); // ✅ Must log a real path

  if (!filePath || typeof filePath !== "string") {
    throw new Error("❌ Invalid file path received");
  }

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const orders = xlsx.utils.sheet_to_json(sheet);

  const baseOutputDir = path.join(app.getPath("documents"), "ML Slips");
  const folderPath = getUniqueFolderPath(baseOutputDir, getDate());
  fs.mkdirSync(folderPath, { recursive: true });
  let lastTracking = getLastTrackingNumber();
  const updatedOrders = await generatePDF(orders, folderPath, lastTracking);
  lastTracking = lastTracking + updatedOrders.length;
  saveLastTrackingNumber(lastTracking);
  await generateChecklistPDF(updatedOrders, folderPath);
  return folderPath;
});
