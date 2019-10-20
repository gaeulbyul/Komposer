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
  const unicodeRanges = [
    'U+1F300-1F5FF', // https://en.wikipedia.org/wiki/Miscellaneous_Symbols_and_Pictographs
    'U+1F600-1F64F', // https://en.wikipedia.org/wiki/Emoticons_(Unicode_block)
    'U+1F680-1F6FF', // https://en.wikipedia.org/wiki/Transport_and_Map_Symbols
    'U+1F900-1F9FF', // https://en.wikipedia.org/wiki/Supplemental_Symbols_and_Pictographs
    'U+2600-26FF', // https://en.wikipedia.org/wiki/Miscellaneous_Symbols
    'U+2700-27BF', // https://en.wikipedia.org/wiki/Dingbat
    'U+2B00-2BFF', // https://en.wikipedia.org/wiki/Miscellaneous_Symbols_and_Arrows
  ]
  const css = `\
    @font-face {
      font-family: 'Twemoji';
      unicode-range: ${unicodeRanges.join(',')};
      src: url('${twemojiUrl}') format('truetype');
    }`
  document.body.appendChild(
    Object.assign(document.createElement('div'), {
      innerHTML: `&shy;<style>${css}</style>`,
    })
  )
}

if (document.getElementById('react-root')) {
  // TODO
  // loadTwemoji()
  loadScripts()
}
