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

function* getScriptPaths() {
  const resources = browser.runtime.getManifest().web_accessible_resources
  for (const resource of resources) {
    if (typeof resource === 'string') {
      // Manifest V2
      yield resource
    } else {
      // Manifest V3
      yield* resource.resources
    }
  }
}

async function loadScripts() {
  for (const path of getScriptPaths()) {
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
