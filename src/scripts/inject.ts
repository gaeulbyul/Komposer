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
    const { editor, editorState } = dig(
      () => getReactEventHandler(editorContentElem).children[0].props
    )
    const editorContainerElem = editorContentElem.parentElement!
    const parentOfEditorRoot = editorRootElem.parentElement!
    const grandParentOfEditorRoot = parentOfEditorRoot.parentElement!
    const sendTweet = () => {
      const grandProps = dig(() => getReactEventHandler(grandParentOfEditorRoot).children.props)
      if (!grandProps) {
        console.error('fail to get grandProps')
        return
      }
      const { sendTweetCommandName, keyCommandHandlers } = grandProps
      const sendTweetFn = keyCommandHandlers[sendTweetCommandName]
      return sendTweetFn()
    }
    parentOfEditorRoot.hidden = true
    const taContainer = document.createElement('div')
    grandParentOfEditorRoot.prepend(taContainer)
    const currentValue = editorState.getCurrentContent().getPlainText()
    const textarea = taContainer.appendChild(document.createElement('textarea'))
    assign(textarea, {
      placeholder: '무슨 일이 일어나고 있나요?',
      value: currentValue,
      onkeypress(event: KeyboardEvent) {
        // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
        event.stopPropagation()
        const isSubmit = event.ctrlKey && event.code === 'Enter'
        if (isSubmit) {
          sendTweet()
        }
      },
      onpaste(event: ClipboardEvent) {
        const { clipboardData } = event
        if (!clipboardData) {
          return
        }
        const isPlainText = clipboardData.types[0] === 'text/plain'
        if (isPlainText) {
          return
        }
        const onPaste = dig(() => getReactEventHandler(editorContainerElem).children.props.onPaste)
        if (typeof onPaste === 'function') {
          onPaste(event)
        }
      },
      oninput() {
        textarea.style.height = '2px'
        textarea.style.height = `${textarea.scrollHeight}px`
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
      ...getThemeColor(),
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
