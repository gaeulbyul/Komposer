if (document.getElementById('react-root')) {
  document.head.appendChild(
    Object.assign(document.createElement('script'), {
      src: browser.runtime.getURL('scripts/inject.js'),
    })
  )
}
