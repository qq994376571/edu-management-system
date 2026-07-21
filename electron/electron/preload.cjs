const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  pickJsonFile: () => ipcRenderer.invoke('dialog:pickJsonFile'),
  loadData: (folderPath, username) => ipcRenderer.invoke('data:load', folderPath, username),
  loadDataFromFile: (filePath) => ipcRenderer.invoke('data:loadFromFile', filePath),
  saveData: (folderPath, data, username) => ipcRenderer.invoke('data:save', folderPath, data, username),
  getStoredPath: (username) => ipcRenderer.invoke('config:getPath', username),
  setStoredPath: (folderPath, username) => ipcRenderer.invoke('config:setPath', folderPath, username),
  backupData: (sourceFolderPath, destinationFolderPath, username) => ipcRenderer.invoke('data:backup', sourceFolderPath, destinationFolderPath, username),
  getMachineId: () => ipcRenderer.invoke('machine:getId'),
  getRememberedCredentials: () => ipcRenderer.invoke('credentials:get'),
  setRememberedCredentials: (credentials) => ipcRenderer.invoke('credentials:set', credentials),
  clearRememberedCredentials: () => ipcRenderer.invoke('credentials:clear'),
  exitApp: () => ipcRenderer.send('app:quit'),
});

