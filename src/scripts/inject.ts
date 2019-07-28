/* TODO:
- 에모지 입력 지원
- 창 크기 바뀌면 내용 사라지는 현상
- ???
*/

{
  function dig<T>(obj: () => T): T | null {
    try {
      return obj()
    } catch (err) {
      if (err instanceof TypeError) {
        return null
      } else {
        throw err
      }
    }
  }

  function getReactEventHandler(target: Element): any {
    const key = Object.keys(target)
      .filter((k: string) => k.startsWith('__reactEventHandlers'))
      .pop()
    return key ? (target as any)[key] : null
  }

  function* getAddedElementsFromMutations(
    mutations: MutationRecord[]
  ): IterableIterator<HTMLElement> {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node instanceof HTMLElement) {
          yield node
        }
      }
    }
  }

  function updateText(editor: any, text: string) {
    const { editorState } = editor.props
    const conts = editorState.getCurrentContent().constructor.createFromText(text)
    const edits = editorState.constructor.createWithContent(conts)
    editor.update(edits)
  }

  interface ThemeColor {
    backgroundColor: string
    textColor: string
  }

  function getThemeColor(): ThemeColor {
    let textColor = '#000'
    let backgroundColor = '#fff'
    {
      const themeElem = document.querySelector<HTMLMetaElement>('meta[name=theme-color]')
      if (themeElem && /^#([0-9a-f]{6})/i.test(themeElem.content)) {
        backgroundColor = themeElem.content
      }
      if (!/fff/i.test(backgroundColor)) {
        textColor = '#fff'
      }
    }
    return { backgroundColor, textColor }
  }

  function applyMagic(editorRootElem: HTMLElement) {
    const editorContentElem = editorRootElem.querySelector<HTMLElement>(
      '.DraftEditor-editorContainer > div[contenteditable=true]'
    )!
    const { editor } = dig(() => getReactEventHandler(editorContentElem).children[0].props)
    const shadowHost = editorRootElem.parentElement!.parentElement!
    const anotherTextArea = shadowHost.attachShadow({ mode: 'open' })
    const { backgroundColor, textColor } = getThemeColor()
    anotherTextArea.innerHTML = `\
      <div>
        <textarea
          placeholder="[여기에 트윗 입력]"
          rows="3"></textarea>
      </div>
      <style>
      *, *::before, *::after {
        box-sizing: border-box;
      }
      div {
        display: flex;
      }
      textarea {
        display: block;
        width: 100%;
        border: 0;
        background-color: ${backgroundColor};
        color: ${textColor};
        font-size: 18px;
        font-family: sans-serif;
        resize: none;
      }
      </style>
    `
    const textarea = anotherTextArea.querySelector('textarea')!
    // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
    textarea.onkeydown = textarea.onkeypress = event => event.stopPropagation()
    // textarea.value = editorContentElem.textContent!
    textarea.oninput = () => {
      updateText(editor, textarea.value)
    }
  }

  function main() {
    new MutationObserver(mutations => {
      for (const elem of getAddedElementsFromMutations(mutations)) {
        const editorRootElem = elem.querySelector<HTMLElement>('.DraftEditor-root')
        if (!editorRootElem) {
          continue
        }
        applyMagic(editorRootElem)
      }
    }).observe(document.body, {
      subtree: true,
      characterData: true,
      childList: true,
    })
    Array.from(document.querySelectorAll<HTMLElement>('.DraftEditor-root')).forEach(elem =>
      applyMagic(elem)
    )
  }

  function initialize() {
    const reactRoot = document.getElementById('react-root')!
    if ('_reactRootContainer' in reactRoot) {
      console.debug('[Komposer] inject!!!')
      main()
    } else {
      console.debug('[Komposer] waiting...')
      setTimeout(initialize, 500)
    }
  }

  initialize()
}
