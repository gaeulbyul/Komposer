/* TODO:
- 에모지 입력 지원
- 창 크기 바뀌면 내용 사라지는 현상
- Ctrl+Enter 단축키 지원
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

  function assign<T>(obj: T, anotherObj: Partial<T>): void {
    Object.assign(obj, anotherObj)
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
    color: string
  }

  function getThemeColor(): ThemeColor {
    let color = '#000'
    let backgroundColor = '#fff'
    const themeElem = document.querySelector<HTMLMetaElement>('meta[name=theme-color]')
    if (themeElem && /^#([0-9a-f]{6})/i.test(themeElem.content)) {
      backgroundColor = themeElem.content
    }
    if (!/fff/i.test(backgroundColor)) {
      color = '#fff'
    }
    return { backgroundColor, color }
  }

  function applyMagic(editorRootElem: HTMLElement) {
    const editorContentElem = editorRootElem.querySelector<HTMLElement>(
      '.DraftEditor-editorContainer > div[contenteditable=true]'
    )!
    const { editor } = dig(() => getReactEventHandler(editorContentElem).children[0].props)
    const parentOfEditorRoot = editorRootElem.parentElement!
    parentOfEditorRoot.hidden = true
    const taContainer = document.createElement('div')
    parentOfEditorRoot.parentElement!.prepend(taContainer)
    const textarea = taContainer.appendChild(document.createElement('textarea'))
    assign(textarea, {
      placeholder: '[여기에 텍스트 입력]',
      // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
      onkeydown(event: KeyboardEvent) {
        event.stopPropagation()
      },
      onkeypress(event: KeyboardEvent) {
        event.stopPropagation()
      },
      // textarea.value = editorContentElem.textContent!
      oninput() {
        textarea.style.height='2px'
        textarea.style.height=`${textarea.scrollHeight}px`
        updateText(editor, textarea.value)
      },
    })
    assign(textarea.style, {
      boxSizing: 'border-box',
      display: 'block',
      width: '100%',
      height: '100%',
      minHeight: '6rem',
      maxHeight: '30rem',
      padding: '0',
      border: '0',
      fontSize: '20px',
      fontFamily: 'sans-serif',
      resize: 'none',
      ...( getThemeColor() )
    })
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
