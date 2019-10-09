const EVENT_SENDING = 'Komposer::SENDING'
const EVENT_ACCEPT_SUGGEST = 'Komposer::ACCEPT_SUGGEST'
const enum HowToHandleEnterKey {
  SendTweet,
  SendDM,
  LineBreak,
  AcceptSuggest,
}

class Komposer {
  private readonly editorRootElem: HTMLElement
  private readonly editorContentElem: HTMLElement
  private readonly draftjsEditor: any
  private readonly draftjsEditorState: any
  private readonly isDM: boolean
  public readonly textareaContainer = document.createElement('div')
  public readonly textarea = document.createElement('textarea')
  public get disabled(): boolean {
    return this.textarea.disabled
  }
  public set disabled(value: boolean) {
    this.textarea.disabled = value
  }
  constructor(editorRootElem: HTMLElement) {
    this.editorRootElem = editorRootElem
    this.editorContentElem = editorRootElem.querySelector<HTMLElement>(
      '.DraftEditor-editorContainer > div[contenteditable=true]'
    )!
    const { editor, editorState } = dig(
      () => getReactEventHandler(this.editorContentElem).children[0].props
    )
    this.isDM = this.editorContentElem.getAttribute('data-testid') === 'dmComposerTextInput'
    this.draftjsEditor = editor
    this.draftjsEditorState = editorState
    this.initializeTextarea()
    this.initializeEvents()
  }
  public static isApplied(elem: HTMLElement) {
    return elem.classList.contains('komposer-applied')
  }
  public applyKomposer() {
    const { editorRootElem } = this
    if (Komposer.isApplied(editorRootElem)) {
      return
    }
    editorRootElem.classList.add('komposer-applied')
    const parentOfEditorRoot = editorRootElem.parentElement!
    parentOfEditorRoot.hidden = true
    const grandParentOfEditorRoot = parentOfEditorRoot.parentElement!
    grandParentOfEditorRoot.prepend(this.textareaContainer)
    if (editorRootElem.contains(document.activeElement)) {
      this.textarea.focus()
    }
  }
  public updateText(text: string) {
    this.updateDraftEditorText(text)
    this.textarea.value = text
  }
  // https://www.everythingfrontend.com/posts/insert-text-into-textarea-at-cursor-position.html
  public insertAtCursor(textToInsert: string) {
    const { textarea } = this
    const { value, selectionStart, selectionEnd } = textarea
    textarea.value = value.slice(0, selectionStart) + textToInsert + value.slice(selectionEnd)
    textarea.selectionStart = textarea.selectionEnd = selectionStart + textToInsert.length
    this.updateDraftEditorText(textarea.value)
    this.fitTextareaHeight()
  }
  private getDraftEditorText(): string {
    return this.draftjsEditorState.getCurrentContent().getPlainText()
  }
  private updateDraftEditorText(text: string) {
    const { draftjsEditorState, draftjsEditor } = this
    const conts = draftjsEditorState.getCurrentContent().constructor.createFromText(text)
    const edits = draftjsEditorState.constructor.createWithContent(conts)
    draftjsEditor.update(edits)
  }
  private initializeTextarea() {
    const { textarea } = this
    textarea.className = 'komposer'
    textarea.title = '(Komposer 확장기능으로 대체한 입력칸입니다.)'
    textarea.placeholder = this.getPlaceholderText()
    textarea.value = this.getDraftEditorText()
    this.textareaContainer.appendChild(textarea)
  }
  private initializeEvents() {
    const { textarea } = this
    textarea.addEventListener('keypress', event => {
      // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
      event.stopPropagation()
      const { code } = event
      if (code === 'Enter') {
        const how = this.handleEnterKey(event)
        if (how !== HowToHandleEnterKey.LineBreak) {
          event.preventDefault()
        }
        switch (how) {
          case HowToHandleEnterKey.SendDM:
            this.sendDM()
            break
          case HowToHandleEnterKey.SendTweet:
            this.sendTweet()
            break
        }
      }
    })
    textarea.addEventListener('input', () => {
      this.fitTextareaHeight()
      this.updateDraftEditorText(this.textarea.value)
    })
    textarea.addEventListener('paste', event => {
      const { clipboardData } = event
      if (!clipboardData) {
        return
      }
      const textData = clipboardData.getData('text')
      if (textData) {
        return
      }
      const onPaste = dig(
        () => getReactEventHandler(this.editorContentElem.parentElement!).children.props.onPaste
      )
      if (typeof onPaste === 'function') {
        onPaste(event)
      }
    })
    textarea.addEventListener('dragover', event => {
      // 요게 없으면 드롭이 안되더라.
      event.stopPropagation()
    })
    textarea.addEventListener('drop', event => {
      event.stopPropagation()
      const dropTarget = this.getDropTarget()
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
    })
    // DM 전송 후 입력칸을 비워준다.
    if (this.isDM) {
      const sendDMButton = document.querySelector<HTMLElement>(
        '[data-testid="dmComposerSendButton"]'
      )!
      sendDMButton.addEventListener('click', () => {
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
  }
  private getPlaceholderText(): string {
    const { editorRootElem } = this
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
  private getDropTarget() {
    return closestWith(this.editorRootElem.parentElement!, elem => {
      const onDrop = dig(() => getReactEventHandler(elem).onDrop)
      return typeof onDrop === 'function'
    })
  }
  private fitTextareaHeight() {
    const { textarea } = this
    textarea.style.height = '2px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }
  private handleEnterKey(event: KeyboardEvent): HowToHandleEnterKey {
    const { isDM } = this
    if (event.code !== 'Enter') {
      throw new Error('I can only handle Enter key')
    }
    const { ctrlKey, shiftKey } = event
    if (isDM) {
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
  private sendTweet() {
    const grandParentOfEditorRoot = this.editorRootElem.parentElement!.parentElement!
    const grandProps = dig(() => getReactEventHandler(grandParentOfEditorRoot).children.props)
    if (!grandProps) {
      throw new Error('fail to get grandProps')
    }
    const { sendTweetCommandName, keyCommandHandlers } = grandProps
    const sendTweetFn = keyCommandHandlers[sendTweetCommandName]
    return sendTweetFn()
  }
  private sendDM() {
    const sendDMButton = document.querySelector<HTMLElement>(
      '[data-testid="dmComposerSendButton"]'
    )!
    const disabled = sendDMButton.getAttribute('aria-disabled') === 'true'
    if (disabled) {
      return
    }
    sendDMButton.click()
  }
}

class KomposerSuggester {
  private readonly suggestArea = document.createElement('div')
  private readonly items: Array<User | Topic> = []
  private indices: Indices = [0, 0]
  private cursor = 0
  constructor(private komposer: Komposer) {
    this.suggestArea.className = 'komposer-suggest-area'
  }
  private hasSuggestItems() {
    return this.items.length > 0
  }
  public connect() {
    const debouncedSuggest = _.debounce(this.suggest.bind(this), 200)
    const { textarea } = this.komposer
    textarea.addEventListener(EVENT_ACCEPT_SUGGEST, event => {
      const { indices, word } = (event as CustomEvent<AcceptedSuggest>).detail
      this.clear()
      const { value } = textarea
      const [startIndex, endIndex] = indices
      const after = value
        .slice(0, startIndex)
        .concat(word)
        .concat(value.slice(endIndex, value.length))
      this.komposer.updateText(after)
      textarea.focus()
    })
    textarea.addEventListener('input', () => {
      const { value, selectionEnd } = textarea
      debouncedSuggest(value, selectionEnd)
    })
    textarea.addEventListener('keyup', event => {
      const { code } = event
      const hasItems = this.hasSuggestItems()
      if (!hasItems) {
        return
      }
      const codesToPreventDefault = ['ArrowUp', 'ArrowDown', 'Escape']
      if (codesToPreventDefault.includes(code)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      switch (code) {
        case 'ArrowUp':
          this.moveCursor(-1)
          break
        case 'ArrowDown':
          this.moveCursor(1)
          break
        case 'Escape':
          this.clear()
          break
      }
      this.renderCursor(this.cursor)
    })
    this.komposer.textareaContainer.appendChild(this.suggestArea)
  }
  private moveCursor(cur: number) {
    if (!this.hasSuggestItems()) {
      return
    }
    const length = this.items.length
    const maxCursor = length - 1
    const { cursor } = this
    let newCursor = cursor + cur
    if (newCursor < 0) {
      newCursor = 0
    } else if (newCursor > maxCursor) {
      newCursor = maxCursor
    }
    this.cursor = newCursor
  }
  private renderCursor(cursor: number) {
    const items = this.suggestArea.querySelectorAll('.komposer-suggest-item')
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === cursor)
    })
  }
  private clear() {
    this.items.length = 0
    this.indices = [0, 0]
    this.cursor = 0
    this.render()
  }
  private suggest(text: string, cursor: number) {
    this.clear()
    const mentions = twttr.txt.extractMentionsWithIndices(text)
    const hashtags = twttr.txt.extractHashtagsWithIndices(text)
    for (const mention of mentions) {
      const { indices, screenName } = mention
      if (cursor === indices[1]) {
        this.indices = indices
        this.suggestMention(screenName, text)
        return
      }
    }
    for (const tag of hashtags) {
      const { indices, hashtag } = tag
      if (cursor === indices[1]) {
        this.indices = indices
        this.suggestHashtag(hashtag, text)
        return
      }
    }
  }
  private async suggestMention(userName: string, text: string) {
    const result = await TypeaheadAPI.typeaheadUserNames(userName, text)
    for (const user of result.users) {
      this.items.push(user)
    }
    this.render()
  }
  private async suggestHashtag(word: string, text: string) {
    const result = await TypeaheadAPI.typeaheadHashTags(word, text)
    for (const topic of result.topics) {
      this.items.push(topic)
    }
    this.render()
  }
  private createUserItem(user: User): HTMLElement {
    const userName = '@' + user.screen_name
    const item = document.createElement('button')
    assign(item, {
      type: 'button',
      className: 'komposer-suggest-item',
    })
    const profileImage = item.appendChild(document.createElement('img'))
    assign(profileImage, {
      src: user.profile_image_url_https,
      width: 48,
      height: 48,
      className: 'image',
    })
    const label = item.appendChild(document.createElement('div'))
    assign(label, {
      // textContent: `${userName} (${user.name})`,
      className: 'double-label',
    })
    const nickNameLabel = label.appendChild(document.createElement('div'))
    assign(nickNameLabel, {
      textContent: user.name,
    })
    const userNameLabel = label.appendChild(document.createElement('div'))
    assign(userNameLabel, {
      textContent: userName,
      className: 'secondary',
    })
    item.addEventListener('click', event => {
      event.preventDefault()
      this.acceptSuggest(this.indices, userName)
    })
    return item
  }
  private createHashtagItem(topic: Topic): HTMLElement {
    const item = document.createElement('button')
    assign(item, {
      type: 'button',
      className: 'komposer-suggest-item',
    })
    const label = item.appendChild(document.createElement('div'))
    assign(label, {
      textContent: topic.topic,
      className: 'label',
    })
    item.addEventListener('click', event => {
      event.preventDefault()
      this.acceptSuggest(this.indices, topic.topic)
    })
    return item
  }
  private acceptSuggest(indices: Indices, word: string) {
    const detail = {
      indices,
      word,
    }
    const customEvent = new CustomEvent<AcceptedSuggest>(EVENT_ACCEPT_SUGGEST, { detail })
    this.komposer.textarea.dispatchEvent(customEvent)
  }
  private render() {
    this.suggestArea.innerHTML = ''
    for (const item of this.items) {
      let itemElem: HTMLElement
      if ('id_str' in item) {
        itemElem = this.createUserItem(item)
      } else {
        itemElem = this.createHashtagItem(item)
      }
      this.suggestArea.appendChild(itemElem)
    }
    this.renderCursor(0)
  }
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

{
  const sendingEventMap = new WeakMap<HTMLElement, EventHandler>()
  const textareaToKomposerMap = new WeakMap<HTMLTextAreaElement, Komposer>()

  function findActiveTextarea(): HTMLTextAreaElement | null {
    let textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea.komposer')
    if (textareas.length === 0) {
      return null
    } else if (textareas.length === 1) {
      return textareas[0]
    }
    const toolBar = document.querySelector<HTMLElement>('[data-testid=toolBar]')
    if (!toolBar) {
      return null
    }
    const closest = closestWith(toolBar, elem => {
      textareas = elem.querySelectorAll<HTMLTextAreaElement>('textarea.komposer')
      return textareas.length === 1
    })
    if (closest) {
      return textareas[0]
    } else {
      return null
    }
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
      const komposer = textareaToKomposerMap.get(activeTextarea)!
      komposer.insertAtCursor(emoji.unified)
    })
  }

  function toggleNightMode(themeElem: HTMLMetaElement) {
    const themeColor = themeElem.content.toUpperCase()
    const nightMode = themeColor !== '#FFFFFF'
    document.body.classList.toggle('komposer-bright', !nightMode)
    document.body.classList.toggle('komposer-dark', nightMode)
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

  function applyMagic(elem: HTMLElement) {
    const kom = new Komposer(elem)
    const komsug = new KomposerSuggester(kom)
    kom.applyKomposer()
    komsug.connect()
    textareaToKomposerMap.set(kom.textarea, kom)
    const sendingEventHandler = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return
      }
      const { disabled } = event.detail
      kom.disabled = disabled
    }
    document.addEventListener(EVENT_SENDING, sendingEventHandler)
    sendingEventMap.set(kom.textarea, sendingEventHandler)
  }

  function observeProgressBar(elem: HTMLElement) {
    if (!elem.matches('[role=progressbar]')) {
      throw new Error('unexpected: non progressbar')
    }
    progressbarObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    })
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
      }
      for (const elem of getRemovedElementsFromMutations(mutations)) {
        // textarea가 사라지면 event를 정리한다
        const textareas = elem.querySelectorAll<HTMLTextAreaElement>('textarea.komposer')
        for (const textarea of textareas) {
          textareaToKomposerMap.delete(textarea)
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
    const colorThemeTag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (colorThemeTag) {
      toggleNightMode(colorThemeTag)
      new MutationObserver(mutations => {
        if (mutations.length <= 0) {
          return
        }
        const target = mutations[0].target as HTMLMetaElement
        toggleNightMode(target)
      }).observe(colorThemeTag, {
        attributeFilter: ['content'],
        attributes: true,
      })
    }
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
