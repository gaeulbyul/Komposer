{
  const EVENT_EMOJI_PICK = 'Komposer::EMOJI_PICK'
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

  function* getRemovedElementsFromMutations(
    mutations: MutationRecord[]
  ): IterableIterator<HTMLElement> {
    for (const { removedNodes } of mutations) {
      for (const node of removedNodes) {
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

  function integrateEmojiPicker() {
    document.addEventListener('click', event => {
      const { target } = event
      if (!(target instanceof HTMLElement)) {
        return
      }
      const isTargetEmoji = target.matches('#emoji_picker_categories_dom_id div[style*="twemoji"]')
      if (!isTargetEmoji) {
        return
      }
      event.stopPropagation()
      const compo = target.parentElement!.parentElement!
      const { emoji } = dig(() => getReactEventHandler(compo).children.props)
      document.dispatchEvent(
        new CustomEvent(EVENT_EMOJI_PICK, {
          detail: emoji,
        })
      )
    })
  }

  const emojiEventMap = new WeakMap<HTMLElement, (evt: Event) => void>()

  const enum HowToHandleEnterKey {
    SendTweet,
    SendDM,
    LineBreak,
  }

  function handleEnterKey(event: KeyboardEvent, isDMInput: boolean): HowToHandleEnterKey {
    if (event.code !== 'Enter') {
      throw new Error('I can only handle Enter key')
    }
    const { ctrlKey, shiftKey } = event
    if (isDMInput) {
      if (shiftKey) {
        return HowToHandleEnterKey.LineBreak
      } else {
        return HowToHandleEnterKey.SendDM
      }
    } else {
      if (ctrlKey) {
        return HowToHandleEnterKey.SendTweet
      } else {
        return HowToHandleEnterKey.LineBreak
      }
    }
  }

  function fitTextareaHeight(textarea: HTMLTextAreaElement) {
    textarea.style.height = '2px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  function applyMagic(editorRootElem: HTMLElement) {
    if (editorRootElem.classList.contains('komposer-applied')) {
      return
    }
    editorRootElem.classList.add('komposer-applied')
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
      className: 'komposer',
      value: currentValue,
      title: '(Komposer 확장기능으로 대체한 입력칸입니다.)',
      onkeypress(event: KeyboardEvent) {
        // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
        event.stopPropagation()
        const { code } = event
        if (code === 'Enter') {
          const how = handleEnterKey(event, isDMInput)
          if (how !== HowToHandleEnterKey.LineBreak) {
            event.preventDefault()
          }
          switch (how) {
            case HowToHandleEnterKey.SendDM:
              sendDM()
              textarea.value = ''
              break
            case HowToHandleEnterKey.SendTweet:
              sendTweet(grandParentOfEditorRoot)
              break
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
        fitTextareaHeight(textarea)
        updateText(editor, textarea.value)
      },
    })
    assign(textarea.style, {
      boxSizing: 'border-box',
      display: 'block',
      width: '100%',
      maxHeight: '30rem',
      padding: '0',
      border: '0',
      fontSize: 'inherit',
      fontFamily: 'sans-serif',
      resize: 'none',
      backgroundColor: 'inherit',
      color: 'inherit',
      outline: '0',
    })
    if (textarea.matches('div[aria-modal=true] textarea.komposer')) {
      textarea.style.minHeight = '6rem'
    }
    if (shouldFocusAfterMagic) {
      textarea.focus()
    }
    fitTextareaHeight(textarea)
    const emojiEventHandler = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return
      }
      const emoji = event.detail
      insertAtCursor(textarea, emoji.unified)
      updateText(editor, textarea.value)
    }
    emojiEventMap.set(textarea, emojiEventHandler)
    document.addEventListener(EVENT_EMOJI_PICK, emojiEventHandler)
  }

  // https://www.everythingfrontend.com/posts/insert-text-into-textarea-at-cursor-position.html
  function insertAtCursor(input: HTMLTextAreaElement, textToInsert: string) {
    const { value, selectionStart, selectionEnd } = input

    // update the value with our text inserted
    input.value = value.slice(0, selectionStart) + textToInsert + value.slice(selectionEnd)

    // update cursor to be at the end of insertion
    input.selectionStart = input.selectionEnd = selectionStart + textToInsert.length
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
      for (const elem of getRemovedElementsFromMutations(mutations)) {
        // textarea가 사라지면 event를 정리한다
        const tas = elem.querySelectorAll<HTMLElement>('textarea.komposer')
        for (const ta of tas) {
          const handler = emojiEventMap.get(ta)
          if (!handler) {
            continue
          }
          document.removeEventListener(EVENT_EMOJI_PICK, handler)
          emojiEventMap.delete(ta)
        }
      }
    }).observe(document.body, {
      subtree: true,
      characterData: true,
      childList: true,
    })
    applyMagicEach(document.querySelectorAll<HTMLElement>('.DraftEditor-root'))
    integrateEmojiPicker()
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
