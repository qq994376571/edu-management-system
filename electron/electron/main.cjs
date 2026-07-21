const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();

const DATA_FILE_NAME = '\u6559\u52a1\u6570\u636e.json';
const configFilePath = path.join(app.getPath('userData'), 'app-config.json');

function readConfig() {
  try {
    if (fs.existsSync(configFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (error) {
    console.error('Failed to read app configuration:', error);
  }
  return {};
}

function writeConfig(config) {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write app configuration:', error);
    return false;
  }
}

function accountDataFileName(username) {
  if (!username) return DATA_FILE_NAME;
  const key = crypto.createHash('sha256').update(String(username)).digest('hex').slice(0, 16);
  return 'education-data-' + key + '.json';
}

function accountDataFilePath(folderPath, username) {
  return path.join(folderPath, accountDataFileName(username));
}

function parseDataFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error('Failed to parse local data file:', error);
    return null;
  }
}

function writeFileAtomically(filePath, content) {
  const temporaryPath = filePath + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function getStoredPath(username) {
  const config = readConfig();
  if (username) {
    return config.dataFolderPaths && typeof config.dataFolderPaths === 'object'
      ? config.dataFolderPaths[username] || null
      : null;
  }
  return config.dataFolderPath || null;
}

function setStoredPath(folderPath, username) {
  const config = readConfig();
  if (username) {
    if (!config.dataFolderPaths || typeof config.dataFolderPaths !== 'object') {
      config.dataFolderPaths = {};
    }
    config.dataFolderPaths[username] = folderPath;
  } else {
    config.dataFolderPath = folderPath;
  }
  return writeConfig(config);
}

ipcMain.handle('dialog:chooseFolder', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: '\u9009\u62e9\u6559\u52a1\u6570\u636e\u5b58\u50a8\u6587\u4ef6\u5939',
    properties: ['openDirectory', 'createDirectory'],
  });
  return !result.canceled && result.filePaths.length ? result.filePaths[0] : null;
});

ipcMain.handle('dialog:pickJsonFile', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: '\u9009\u62e9\u6559\u52a1\u6570\u636e\u6587\u4ef6',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return !result.canceled && result.filePaths.length ? result.filePaths[0] : null;
});

ipcMain.handle('data:load', async (_event, folderPath, username) => {
  if (typeof folderPath !== 'string' || !folderPath) return null;

  const accountData = parseDataFile(accountDataFilePath(folderPath, username));
  if (accountData) return accountData;

  if (!username) return null;

  const legacyData = parseDataFile(path.join(folderPath, DATA_FILE_NAME));
  return legacyData && legacyData.ownerUsername === username ? legacyData : null;
});

ipcMain.handle('data:loadFromFile', async (_event, filePath) => {
  return typeof filePath === 'string' ? parseDataFile(filePath) : null;
});

ipcMain.handle('data:save', async (_event, folderPath, data, username) => {
  try {
    if (typeof folderPath !== 'string' || !folderPath || !data || typeof data !== 'object') return false;
    fs.mkdirSync(folderPath, { recursive: true });
    writeFileAtomically(
      accountDataFilePath(folderPath, username),
      JSON.stringify(data, null, 2),
    );
    return true;
  } catch (error) {
    console.error('Failed to save local data:', error);
    return false;
  }
});

ipcMain.handle('config:getPath', async (_event, username) => getStoredPath(username));

ipcMain.handle('config:setPath', async (_event, folderPath, username) => {
  return typeof folderPath === 'string' && folderPath ? setStoredPath(folderPath, username) : false;
});

ipcMain.handle('data:backup', async (_event, sourceFolderPath, destinationFolderPath, username) => {
  try {
    if (typeof sourceFolderPath !== 'string' || typeof destinationFolderPath !== 'string') return null;
    const source = accountDataFilePath(sourceFolderPath, username);
    if (!fs.existsSync(source)) return null;
    fs.mkdirSync(destinationFolderPath, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[T:.]/g, '-');
    const destination = path.join(destinationFolderPath, 'education-backup-' + timestamp + '.json');
    fs.copyFileSync(source, destination);
    return destination;
  } catch (error) {
    console.error('Failed to back up local data:', error);
    return null;
  }
});

ipcMain.handle('machine:getId', async () => {
  const config = readConfig();
  if (!config.machineId) {
    config.machineId = crypto.randomUUID();
    writeConfig(config);
  }
  return config.machineId;
});

ipcMain.handle('credentials:get', async () => {
  const config = readConfig();
  return config.rememberedCredentials || null;
});

ipcMain.handle('credentials:set', async (_event, credentials) => {
  const config = readConfig();
  config.rememberedCredentials = credentials && typeof credentials === 'object' ? credentials : null;
  return writeConfig(config);
});

ipcMain.handle('credentials:clear', async () => {
  const config = readConfig();
  delete config.rememberedCredentials;
  return writeConfig(config);
});

ipcMain.on('app:quit', () => app.quit());

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: true,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html')).catch((error) => {
      console.error('Failed to load index.html:', error);
    });
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in Electron main process:', error);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
