const { app, BrowserWindow, session } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 680,
    backgroundColor: '#f5f2eb', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    const xbloom = devices.find(device => /xbloom/i.test(device.deviceName || ''))
    callback(xbloom?.deviceId || devices[0]?.deviceId || '')
  })
  if (app.isPackaged) win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else win.loadURL('http://localhost:5173')
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'bluetooth')
  session.defaultSession.setDevicePermissionHandler(details => details.deviceType === 'bluetooth')
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
