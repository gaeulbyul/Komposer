import * as electron from 'electron'
import * as path from 'path'
import * as Url from 'url'

const { app, BrowserWindow } = electron

const devMode = /^development$/i.test(process.env.NODE_ENV || '')

app.setPath('userData', path.join(__dirname, '../data/chromium'))
app.commandLine.appendSwitch('force-color-profile', 'srgb')

let mainWindow: Electron.BrowserWindow | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    center: true,
    width: 1280,
    height: 768,
    title: 'Twitter',
    backgroundColor: '#1c6399',
    autoHideMenuBar: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      nodeIntegration: true,
      webSecurity: true,
      webviewTag: true,
    },
  })
  // mainWindow.maximize()

  mainWindow.loadURL(
    Url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    })
  )
  if (devMode) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show())

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/*
app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }
})
*/

app.on('ready', () => {
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow()
  }
})
