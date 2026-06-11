const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

// IPC handlers for preload bridge
ipcMain.handle('read-file', async (_event, filePath) => {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  return fs.readFileSync(resolvedPath, 'utf-8');
});

ipcMain.handle('write-file', async (_event, filePath, data) => {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  fs.writeFileSync(resolvedPath, data, 'utf-8');
  return true;
});

ipcMain.handle('server-port', async () => {
  return 3001;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  // Load the built Vite app
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    // In dev mode, wait for vite server to start or just load index.html from dist if built
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Start the server.js background process
  const serverPath = path.join(__dirname, 'server.js');
  serverProcess = spawn('node', [serverPath], { stdio: 'inherit' });

  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (serverProcess) serverProcess.kill();
});
