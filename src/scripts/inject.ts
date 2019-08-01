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

  function getPlaceholderText(editorRootElem: HTMLElement): string {
    let placeholder = '무슨 일이 일어나고 있나요?'
    const placeholderElem = editorRootElem.querySelector('.public-DraftEditorPlaceholder-root')
    if (placeholderElem) {
      const { textContent } = placeholderElem
      if (textContent) {
        placeholder = textContent
      }
    }
    return placeholder
  }

  function sendTweet(grandParentOfEditorRoot: HTMLElement) {
    const grandProps = dig(() => getReactEventHandler(grandParentOfEditorRoot).children.props)
    if (!grandProps) {
      throw new Error('fail to get grandProps')
    }
    const { sendTweetCommandName, keyCommandHandlers } = grandProps
    const sendTweetFn = keyCommandHandlers[sendTweetCommandName]
    return sendTweetFn()
  }

  function sendDM() {
    const sendDMButton = document.querySelector<HTMLElement>('[data-testid="dmComposerSendButton"]')
    if (!sendDMButton) {
      throw new Error(`can't find dmComposerSendButton!`)
    }
    const disabled = sendDMButton.getAttribute('aria-disabled') === 'true'
    if (disabled) {
      return
    }
    sendDMButton.click()
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
    const isDMInput =
      dig(() => {
        try {
          const { testID } = getReactEventHandler(grandParentOfEditorRoot).children.props
          return testID === 'dmComposerTextInput'
        } catch (e) {
          return false
        }
      }) || false
    const activeElement = document.activeElement
    const shouldFocusAfterMagic = editorRootElem.contains(activeElement)
    parentOfEditorRoot.hidden = true
    const taContainer = document.createElement('div')
    grandParentOfEditorRoot.prepend(taContainer)
    const placeholder = getPlaceholderText(editorRootElem)
    const currentValue = editorState.getCurrentContent().getPlainText()
    const textarea = taContainer.appendChild(document.createElement('textarea'))
    assign(textarea, {
      placeholder,
      value: currentValue,
      onkeypress(event: KeyboardEvent) {
        // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
        event.stopPropagation()
        const isSubmit = event.ctrlKey && event.code === 'Enter'
        if (isSubmit) {
          if (isDMInput) {
            sendDM()
            textarea.value = ''
          } else {
            sendTweet(grandParentOfEditorRoot)
          }
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
    if (shouldFocusAfterMagic) {
      textarea.focus()
    }
  }

  function main() {
    function applyMagicEach(elems: NodeListOf<HTMLElement>) {
      elems.forEach(applyMagic)
    }
    new MutationObserver(mutations => {
      for (const elem of getAddedElementsFromMutations(mutations)) {
        const editorRootElems = elem.querySelectorAll<HTMLElement>('.DraftEditor-root')
        applyMagicEach(editorRootElems)
      }
    }).observe(document.body, {
      subtree: true,
      characterData: true,
      childList: true,
    })
    applyMagicEach(document.querySelectorAll<HTMLElement>('.DraftEditor-root'))
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
