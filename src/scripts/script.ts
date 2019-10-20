async function injectScript(src: string) {
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), {
      onload: resolve,
      onerror: reject,
      src,
    })
    document.head.appendChild(script)
  })
}

async function loadScripts() {
  const scripts = browser.runtime.getManifest().web_accessible_resources!
  for (const path of scripts) {
    if (!path.endsWith('.js')) {
      continue
    }
    const src = browser.runtime.getURL(path)
    await injectScript(src)
  }
}

function loadTwemoji() {
  const twemojiUrl = browser.runtime.getURL('/vendor/twemoji-mozilla.ttf')
  const css = `\
    @font-face {
      font-family: 'Twemoji';
      src: url('${twemojiUrl}') format('truetype');
    }`
  document.body.appendChild(
    Object.assign(document.createElement('div'), {
      innerHTML: `&shy;<style>${css}</style>`,
    })
  )
}

if (document.getElementById('react-root')) {
  loadTwemoji()
  loadScripts()
}
