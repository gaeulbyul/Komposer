const EVENT_SENDING = 'Komposer::SENDING'
const EVENT_ACCEPT_SUGGEST = 'Komposer::ACCEPT_SUGGEST'
const enum HowToHandleEnterKey {
  SendTweet,
  SendDM,
  LineBreak,
}

class Komposer {
  private readonly editorRootElem: HTMLElement
  private readonly editorContentElem: HTMLElement
  private readonly draftjsEditor: any
  private readonly draftjsEditorState: any
  private readonly textareaContainer = document.createElement('div')
  public readonly isDM: boolean
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
  private currentText = ''
  private hashflags: HashFlagsObj = {}
  constructor(private komposer: Komposer) {
    this.suggestArea.className = 'komposer-suggest-area'
    this.loadHashFlagsStore()
  }
  private hasSuggestItems() {
    return this.items.length > 0
  }
  public connect() {
    const debouncedSuggest = _.debounce(this.suggest.bind(this), 500)
    // 화살표키를 한 번 눌렀는데도 커서가 두 번 이동하는 경우가 있더라.
    // debounce 걸어서 막음
    const debouncedMoveCursor = _.debounce(this.moveCursor.bind(this), 100, {
      leading: true,
      trailing: false,
    })
    const { textarea } = this.komposer
    textarea.addEventListener(EVENT_ACCEPT_SUGGEST, event => {
      const { indices, word } = (event as CustomEvent<AcceptedSuggest>).detail
      this.clear()
      const { value } = textarea
      const [startIndex, endIndex] = indices
      const after = value
        .slice(0, startIndex)
        .concat(word)
        .concat(' ')
        .concat(value.slice(endIndex, value.length))
      const afterCursor = startIndex + word.length + 1
      // Enter키로 제안을 선택하면 조합중이던 한글이 끝에 입력되는 버그가 있다.
      // 이를 막기위해 잠시 blur를 하여 조합한 글자를 못 붙게 함.
      textarea.blur()
      setTimeout(() => {
        this.komposer.updateText(after)
        textarea.focus()
        textarea.selectionStart = textarea.selectionEnd = afterCursor
      }, 50)
    })
    textarea.addEventListener('input', () => {
      debouncedSuggest(textarea)
    })
    textarea.addEventListener('keydown', event => {
      const { code } = event
      if (!this.hasSuggestItems()) {
        return
      }
      const codesToPreventDefault = ['ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'Tab']
      if (codesToPreventDefault.includes(code)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      switch (code) {
        case 'Tab':
          debouncedMoveCursor(event.shiftKey ? -1 : 1)
          break
        case 'ArrowUp':
          debouncedMoveCursor(-1)
          break
        case 'ArrowDown':
          debouncedMoveCursor(1)
          break
        case 'Escape':
          this.clear()
          break
        case 'Enter':
          this.acceptSuggestOnCursor()
          break
      }
      this.renderCursor(this.cursor)
    })
    document.body.appendChild(this.suggestArea)
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
    this.currentText = ''
    this.render()
  }
  private async suggest(textarea: HTMLTextAreaElement) {
    const { value: text, selectionEnd: cursor } = textarea
    if (!text) {
      this.clear()
      return
    }
    // 한글 조합(composition)이벤트 등으로 인해 suggest가 여러번 호출되었을 경우
    // 발생할 수 있는 오작동을 막아줌
    if (text === this.currentText) {
      return
    }
    this.currentText = text
    const entities = twttr.txt.extractEntitiesWithIndices(text)
    const entity = entities.find(entity => entity.indices[1] === cursor)
    if (!entity) {
      this.clear()
      return
    }
    let result: TypeaheadResult
    if ('screenName' in entity) {
      result = await TypeaheadAPI.typeaheadUserNames(entity.screenName, text)
    } else if ('hashtag' in entity) {
      result = await TypeaheadAPI.typeaheadHashTags(entity.hashtag, text)
    } else {
      this.clear()
      return
    }
    this.clear()
    this.currentText = text
    this.indices = entity.indices
    let count = 1
    for (const userOrTopic of [...result.users, ...result.topics]) {
      this.items.push(userOrTopic)
      if (++count > 10) {
        break
      }
    }
    this.render()
  }
  private createUserItem(user: User): HTMLElement {
    const userName = '@' + user.screen_name
    const item = document.createElement('button')
    assign(item, {
      type: 'button',
      title: `${user.name}\n${userName}`,
      className: 'komposer-suggest-item mention',
    })
    const profileImage = item.appendChild(document.createElement('img'))
    assign(profileImage, {
      src: user.profile_image_url_https,
      width: 40,
      height: 40,
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
      className: 'primary',
    })
    if (user.verified) {
      nickNameLabel.innerHTML += VERIFIED_BADGE
    }
    if (user.is_protected) {
      nickNameLabel.innerHTML += PROTECTED_ICON
    }
    const userNameLabel = label.appendChild(document.createElement('div'))
    assign(userNameLabel, {
      textContent: userName,
      className: 'secondary',
    })
    item.addEventListener('click', event => {
      event.preventDefault()
      this.acceptSuggest(userName)
    })
    return item
  }
  private getHashFlag(hashtag: string): HashFlag | null {
    const tagWithoutHash = hashtag.replace(/^#/, '').toLowerCase()
    const flags = this.hashflags[tagWithoutHash]
    if (flags) {
      const flag = flags[0]
      const { startMs, endMs } = flag
      const now = Date.now()
      const isOngoing = startMs < now && now < endMs
      if (isOngoing) {
        return flag
      }
    }
    return null
  }
  private createHashtagItem(topic: Topic): HTMLElement {
    const item = document.createElement('button')
    const hashtag = topic.topic
    assign(item, {
      type: 'button',
      title: hashtag,
      className: 'komposer-suggest-item hashtag',
    })
    const label = item.appendChild(document.createElement('div'))
    assign(label, {
      textContent: hashtag,
      className: 'label',
    })
    const hashflag = this.getHashFlag(hashtag)
    if (hashflag) {
      const flagImg = label.appendChild(document.createElement('img'))
      assign(flagImg, {
        src: hashflag.url,
        className: 'hashflag',
      })
    }
    item.addEventListener('click', event => {
      event.preventDefault()
      this.acceptSuggest(hashtag)
    })
    return item
  }
  private acceptSuggestOnCursor() {
    let word = ''
    const currentItem = this.items[this.cursor]
    if ('id_str' in currentItem) {
      word = '@' + currentItem.screen_name
    } else {
      word = currentItem.topic
    }
    this.acceptSuggest(word)
  }
  private acceptSuggest(word: string) {
    const { indices } = this
    const detail = {
      indices,
      word,
    }
    const customEvent = new CustomEvent<AcceptedSuggest>(EVENT_ACCEPT_SUGGEST, { detail })
    this.komposer.textarea.dispatchEvent(customEvent)
    this.clear()
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
    this.relocate()
  }
  private relocate() {
    const { textarea } = this.komposer
    const { x, y, height } = textarea.getBoundingClientRect() as DOMRect
    assign(this.suggestArea.style, {
      top: `${y + height}px`,
      left: `${x}px`,
    })
  }
  private loadHashFlagsStore() {
    const store = getReactEventHandler(document.querySelector('[data-reactroot]')!).children.props
      .children.props.store
    this.hashflags = dig(() => store.getState().hashflags.hashflags) || {}
  }
  public destruct() {
    this.clear()
    this.suggestArea.remove()
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
  const textareaToSuggesterMap = new WeakMap<HTMLTextAreaElement, KomposerSuggester>()

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

  function findEmojiButtonFromTarget(elem: HTMLElement) {
    const clickedOnEmoji = elem.matches('#emoji_picker_categories_dom_id div[style*=twemoji]')
    if (clickedOnEmoji) {
      return elem
    }
    const maybeClickedOnMargin = elem.matches('div[aria-selected][role=option]')
    if (maybeClickedOnMargin) {
      const maybe = elem.querySelector('div[style*=twemoji]')
      if (maybe instanceof HTMLElement) {
        return maybe
      }
    }
    return
  }

  function integrateEmojiPicker() {
    document.addEventListener('click', event => {
      const { target } = event
      if (!(target instanceof HTMLElement)) {
        return
      }
      const emojiButton = findEmojiButtonFromTarget(target)
      if (!emojiButton) {
        return
      }
      event.stopPropagation()
      const emojiDataElem = emojiButton.parentElement!.parentElement!
      // 피부색을 적용할 수 있는 에모지는 activeSkinTone에 값(object)이 들어있고,
      // 그렇지 않은 에모지는 activeSkinTone이 undefined다.
      const { activeSkinTone, emoji } = dig<any>(() => {
        const child = getReactEventHandler(emojiDataElem).children
        return {
          emoji: child.props.emoji,
          activeSkinTone: child._owner.stateNode.props.activeSkinTone,
        }
      })
      let emojiStr = ''
      if (emoji.skin_variations && activeSkinTone && activeSkinTone.codepoint) {
        emojiStr = emoji.skin_variations[activeSkinTone.codepoint].unified
      } else {
        emojiStr = emoji.unified
      }
      const activeTextarea = findActiveTextarea()
      if (!activeTextarea) {
        return
      }
      const komposer = textareaToKomposerMap.get(activeTextarea)!
      komposer.insertAtCursor(emojiStr)
    })
  }

  // https://stackoverflow.com/a/11868159
  // http://www.w3.org/TR/AERT#color-contrast
  // hexColor는 #RRGGBB 의 문자열
  function getBrightness(hexColor: string): number {
    if (!/^#[0-9a-f]{6}$/i.test(hexColor)) {
      throw new Error('invalid color format')
    }
    const [red, green, blue] = hexColor.match(/[0-9a-f]{2}/gi)!.map(hex => parseInt(hex, 16))
    const brightness = red * 299 + green * 587 + blue * 114
    return Math.round(brightness / 1000)
  }

  // DarkReader등의 확장기능 대응을 위해 기존 트위터에 없는 색상이 나타나면
  // 밝기를 구해 색상테마를 맞춘다.
  function toggleNightMode(themeElem: HTMLMetaElement) {
    let themeColor = themeElem.content.toUpperCase()
    const bodyStyleRaw = document.body.getAttribute('style') || ''
    const darkReaderMatch = /--darkreader-inline-bgcolor:(#[0-9A-Fa-f]{6})/.exec(bodyStyleRaw)
    if (darkReaderMatch) {
      themeColor = darkReaderMatch[1]
    }
    const twitterColors = ['#FFFFFF', '#15202B', '#000000']
    if (!twitterColors.includes(themeColor)) {
      const brightness = getBrightness(themeColor)
      console.info('brightness: %d', brightness)
      if (brightness > 150) {
        themeColor = '#FFFFFF'
      } else if (brightness > 20) {
        themeColor = '#181A1B'
      } else {
        themeColor = '#000000'
      }
    }
    document.body.setAttribute('data-komposer-theme', themeColor)
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
    const komposer = new Komposer(elem)
    komposer.applyKomposer()
    textareaToKomposerMap.set(komposer.textarea, komposer)
    if (!komposer.isDM) {
      const suggester = new KomposerSuggester(komposer)
      suggester.connect()
      textareaToSuggesterMap.set(komposer.textarea, suggester)
    }
    const sendingEventHandler = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return
      }
      const { disabled } = event.detail
      komposer.disabled = disabled
    }
    document.addEventListener(EVENT_SENDING, sendingEventHandler)
    sendingEventMap.set(komposer.textarea, sendingEventHandler)
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
          const suggester = textareaToSuggesterMap.get(textarea)
          if (suggester) {
            suggester.destruct()
            textareaToSuggesterMap.delete(textarea)
          }
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
