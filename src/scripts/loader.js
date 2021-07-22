async function injectScript(src) {
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
  const scripts = browser.runtime.getManifest().web_accessible_resources
  for (const path of scripts) {
    if (!path.endsWith('.js')) {
      continue
    }
    const src = browser.runtime.getURL(path)
    await injectScript(src)
  }
}

if (document.getElementById('react-root')) {
  loadScripts()
}
