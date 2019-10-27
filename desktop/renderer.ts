import * as electron from 'electron'
import * as fs from 'fs'
import * as path from 'path'

import * as electronContextMenu from 'electron-context-menu'

const devMode = /^development$/i.test(process.env.NODE_ENV || '')

function openLink(url: string): void {
  electron.shell.openExternal(url)
}

function readFile(kpath: string) {
  return fs.readFileSync(path.join(__dirname, kpath), 'utf8')
}

document.addEventListener('DOMContentLoaded', () => {
  const webview = document.getElementById('twitter-webview') as Electron.WebviewTag
  const webContents = webview.getWebContents()
  electronContextMenu({
    window: webview,
    showCopyImageAddress: true,
    showSaveImageAs: true,
    // append (_actions, _params, _win) { return [] }
  })
  webview.addEventListener('new-window', event => {
    openLink(event.url)
  })
  webContents.on('dom-ready', () => {
    if (devMode) {
      webview.openDevTools()
    }
  })
  webContents.on('did-finish-load', () => {
    const komposerCss = readFile('../build/styles/komposer.css')
    webContents.insertCSS(komposerCss)
    loadKomposer(webContents)
  })
  webContents.on('page-title-updated', (_event, title) => {
    document.title = title
  })
})

function loadKomposer(webContents: electron.WebContents) {
  const twitterText = readFile('../build/vendor/twitter-text.min.js')
  const lodash = readFile('../build/vendor/lodash-custom.min.js')
  const komposerApi = readFile('../build/scripts/api.js')
  const komposerMain = readFile('../build/scripts/inject.js')
  webContents.executeJavaScript([twitterText, lodash, komposerApi, komposerMain].join('\n'))
}
