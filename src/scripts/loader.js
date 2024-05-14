function injectScript(src) {
  const script = document.createElement('script')
  script.onload = script.onerror = () => document.head.removeChild(script)
  script.src = src
  document.head.appendChild(script)
}

if (document.getElementById('react-root')) {
  const src = chrome.runtime.getURL('bundled/komposer.bun.js')
  injectScript(src)
}
