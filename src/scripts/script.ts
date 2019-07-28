namespace Komposer.Content {
  function injectScript(path: string): Promise<void> {
    return new Promise(resolve => {
      const script = document.createElement('script')
      script.addEventListener('load', () => {
        resolve()
      })
      script.src = browser.runtime.getURL(path)
      const appendTarget = document.head || document.documentElement
      appendTarget.appendChild(script)
    })
  }

  export function initialize() {
    const reactRoot = document.getElementById('react-root')
    if (reactRoot) {
      injectScript('scripts/inject.js')
    }
  }
}

Komposer.Content.initialize()
