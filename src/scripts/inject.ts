{
  const EVENT_SENDING = 'Komposer::SENDING'
  type EventHandler = (event: Event) => void
  const sendingEventMap = new WeakMap<HTMLElement, EventHandler>()
  const textareaToEditorMap = new WeakMap<HTMLTextAreaElement, any>()

  const enum HowToHandleEnterKey {
    SendTweet,
    SendDM,
    LineBreak,
  }

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

  function closestWith(
    elem: HTMLElement,
    filteringFn: (elem: HTMLElement) => boolean
  ): HTMLElement | null {
    let { parentElement } = elem
    while (parentElement) {
      const filterResult = filteringFn(parentElement)
      if (filterResult) {
        return parentElement
      } else {
        parentElement = parentElement.parentElement
      }
    }
    return null
  }

  function findActiveTextarea(): HTMLTextAreaElement | null {
    let komposers = document.querySelectorAll<HTMLTextAreaElement>('textarea.komposer')
    if (komposers.length === 0) {
      return null
    } else if (komposers.length === 1) {
      return komposers[0]
    }
    const toolBar = document.querySelector<HTMLElement>('[data-testid=toolBar]')
    if (!toolBar) {
      return null
    }
    const closest = closestWith(toolBar, elem => {
      komposers = elem.querySelectorAll<HTMLTextAreaElement>('textarea.komposer')
      return komposers.length === 1
    })
    if (closest) {
      return komposers[0]
    } else {
      return null
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

  function sendDM(sendDMButton: HTMLElement) {
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
      const activeTextarea = findActiveTextarea()
      if (!activeTextarea) {
        return
      }
      const activeEditor = textareaToEditorMap.get(activeTextarea)!
      insertAtCursor(activeTextarea, emoji.unified)
      updateText(activeEditor, activeTextarea.value)
      fitTextareaHeight(activeTextarea)
    })
  }

  const progressbarObserver = new MutationObserver(mutations => {
    const { target } = mutations[0]
    if (!(target instanceof HTMLElement)) {
      return
    }
    const valuenow = target.getAttribute('aria-valuenow')
    const realValue = parseInt(valuenow || '0', 10) || 0
    const disabled = realValue > 0
    document.dispatchEvent(
      new CustomEvent(EVENT_SENDING, {
        detail: {
          disabled,
        },
      })
    )
  })

  function observeProgressBar(elem: HTMLElement) {
    if (!elem.matches('[role=progressbar]')) {
      throw new Error('unexpected: non progressbar')
    }
    progressbarObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    })
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
    const sendDMButton = document.querySelector<HTMLElement>('[data-testid="dmComposerSendButton"]')
    const isDMInput = sendDMButton != null
    const activeElement = document.activeElement
    const shouldFocusAfterMagic = editorRootElem.contains(activeElement)
    parentOfEditorRoot.hidden = true
    const taContainer = document.createElement('div')
    grandParentOfEditorRoot.prepend(taContainer)
    const dropTarget = closestWith(parentOfEditorRoot, elem => {
      const onDrop = dig(() => getReactEventHandler(elem).onDrop)
      return typeof onDrop === 'function'
    })
    const placeholder = getPlaceholderText(editorRootElem)
    const currentValue = editorState.getCurrentContent().getPlainText()
    const textarea = taContainer.appendChild(document.createElement('textarea'))
    textareaToEditorMap.set(textarea, editor)
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
              sendDM(sendDMButton!)
              break
            case HowToHandleEnterKey.SendTweet:
              sendTweet(grandParentOfEditorRoot)
              break
          }
        }
      },
      ondragover(event: DragEvent) {
        // 요게 없으면 드롭이 안되더라.
        event.stopPropagation()
      },
      ondrop(event: DragEvent) {
        event.stopPropagation()
        const onDrop = dig(() => getReactEventHandler(dropTarget!).onDrop)
        const items = event.dataTransfer!.items
        const isMedia = items[0] && !items[0].type.startsWith('text/')
        if (isMedia) {
          onDrop(event)
        } else {
          // 여기서 onDrop은 텍스트 삽입을 해주진 않고,
          // 드래그/드롭시 입력칸 주위에 나타나는 점선 테두리를 없애는 역할을 해준다.
          // 단, setTimeout 없이 곧바로 호출하면 텍스트 삽입이 되지 않는다.
          window.setTimeout(() => {
            onDrop(event)
          })
        }
      },
      onpaste(event: ClipboardEvent) {
        const { clipboardData } = event
        if (!clipboardData) {
          return
        }
        const textData = clipboardData.getData('text')
        if (textData) {
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
    if (shouldFocusAfterMagic) {
      textarea.focus()
    }
    fitTextareaHeight(textarea)
    if (sendDMButton) {
      sendDMButton.addEventListener('click', _event => {
        textarea.value = ''
        // 그냥 focus 하면 글자입력을 할 수 없다.
        // 이 시점에서 이미 activeElement 는 textarea 라서
        // .focus() 메서드를 호출해도 별다른 동작을 하지 않는것으로 추정(?)
        setTimeout(() => {
          if (textarea.isSameNode(document.activeElement)) {
            textarea.blur()
            textarea.focus()
          }
        }, 50)
      })
    }
    const sendingEventHandler = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return
      }
      const { disabled } = event.detail
      textarea.disabled = disabled
    }
    document.addEventListener(EVENT_SENDING, sendingEventHandler)
    sendingEventMap.set(textarea, sendingEventHandler)
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
    function observerProgressBarEach(elems: NodeListOf<HTMLElement>) {
      elems.forEach(observeProgressBar)
    }
    new MutationObserver(mutations => {
      for (const elem of getAddedElementsFromMutations(mutations)) {
        const editorRootElems = elem.querySelectorAll<HTMLElement>('.DraftEditor-root')
        applyMagicEach(editorRootElems)
        const progressbars = elem.querySelectorAll<HTMLElement>('[role=progressbar]')
        observerProgressBarEach(progressbars)
      }
      for (const elem of getRemovedElementsFromMutations(mutations)) {
        // textarea가 사라지면 event를 정리한다
        const textareas = elem.querySelectorAll<HTMLTextAreaElement>('textarea.komposer')
        for (const textarea of textareas) {
          textareaToEditorMap.delete(textarea)
          const sendingEventHandler = sendingEventMap.get(textarea)
          if (sendingEventHandler) {
            document.removeEventListener(EVENT_SENDING, sendingEventHandler)
            sendingEventMap.delete(textarea)
          }
        }
      }
    }).observe(document.body, {
      subtree: true,
      characterData: true,
      childList: true,
    })
    applyMagicEach(document.querySelectorAll<HTMLElement>('.DraftEditor-root'))
    observerProgressBarEach(document.querySelectorAll<HTMLElement>('[role=progressbar]'))
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
