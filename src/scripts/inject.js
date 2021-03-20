// @flow

type HowToHandleEnterKey = 'SendTweet' | 'SendDM' | 'LineBreak'

{
  const BEARER_TOKEN = `AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA`

  const EVENT_SENDING = 'Komposer::SENDING'
  const EVENT_ACCEPT_SUGGEST = 'Komposer::ACCEPT_SUGGEST'

  const userSuggestionsCache = new Map<string, TypeaheadResult>()
  const hashtagSuggestionsCache = new Map<string, TypeaheadResult>()

  function force<T>(value: ?T): T {
    if (value != null) {
      return value
    } else {
      throw new TypeError('value is null!')
    }
  }

  class TypeaheadAPI {
    static getCSRFToken() {
      const match = /\bct0=([0-9a-f]+)\b/i.exec(document.cookie)
      if (match && match[1]) {
        return match[1]
      } else {
        throw new Error('Failed to get CSRF token.')
      }
    }

    static generateTwitterAPIOptions() {
      const csrfToken = this.getCSRFToken()
      const headers = new Headers()
      headers.set('authorization', `Bearer ${BEARER_TOKEN}`)
      headers.set('x-csrf-token', csrfToken)
      headers.set('x-twitter-active-user', 'yes')
      headers.set('x-twitter-auth-type', 'OAuth2Session')
      // headers.set('x-twitter-client-language', 'ko')
      return {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
        referrer: location.href,
        headers,
      }
    }

    static async typeaheadHashTags(word: string, text: string): Promise<TypeaheadResult> {
      const url = new URL('https://api.twitter.com/1.1/search/typeahead.json')
      const fetchOptions = this.generateTwitterAPIOptions()
      url.searchParams.set('src', 'compose')
      url.searchParams.set('result_type', 'topics')
      url.searchParams.set('topic_type', 'hashtag')
      url.searchParams.set('context_text', text)
      url.searchParams.set('q', `#${word}`)
      const response = await fetch(url.toString(), fetchOptions)
      const responseJson = await response.json()
      return responseJson
    }

    static async typeaheadUserNames(word: string, text: string): Promise<TypeaheadResult> {
      const url = new URL('https://api.twitter.com/1.1/search/typeahead.json')
      const fetchOptions = this.generateTwitterAPIOptions()
      url.searchParams.set('src', 'compose')
      url.searchParams.set('result_type', 'users')
      url.searchParams.set('context_text', text)
      url.searchParams.set('q', word)
      const response = await fetch(url.toString(), fetchOptions)
      const responseJson = await response.json()
      return responseJson
    }
  }

  class Komposer {
    /*flow-include
    _editorRootElem: HTMLElement
    _editorContentElem: HTMLElement
    _draftjsEditor: any
    _draftjsEditorState: any
    _textareaContainer: HTMLElement
    isDM: boolean
    textarea: HTMLTextAreaElement
    */
    get disabled(): boolean {
      return this.textarea.disabled
    }
    set disabled(value: boolean) {
      this.textarea.disabled = value
    }
    constructor(editorRootElem: HTMLElement) {
      this._textareaContainer = document.createElement('div')
      this.textarea = document.createElement('textarea')
      // (특히 DM에서) 처음 생성될 때 입력칸 높이가 불필요하게 크더라.
      // 최초에 여기서 1px로 하고, applyKomposer 함수에서 _fitTextareaHeight 호출해서
      // 높이를 맞춘다.
      this.textarea.style.height = '1px'
      this._editorRootElem = editorRootElem
      this._editorContentElem = force(
        editorRootElem.querySelector('.DraftEditor-editorContainer > div[contenteditable=true]')
      )
      const { editor, editorState } = getReactEventHandler(
        this._editorContentElem
      ).children[0].props
      this.isDM = this._editorContentElem.getAttribute('data-testid') === 'dmComposerTextInput'
      this._draftjsEditor = editor
      this._draftjsEditorState = editorState
      this._initializeTextarea()
      this._initializeEvents()
    }
    _isApplied() {
      return this._editorRootElem.classList.contains('komposer-applied')
    }
    applyKomposer() {
      const { _editorRootElem: editorRootElem } = this
      if (this._isApplied()) {
        return
      }
      editorRootElem.classList.add('komposer-applied')
      const parentOfEditorRoot = editorRootElem.parentElement
      if (!(parentOfEditorRoot instanceof HTMLElement)) {
        throw new TypeError('parentOfEditorRoot is missing?')
      }
      parentOfEditorRoot.hidden = true
      const grandParentOfEditorRoot = force(parentOfEditorRoot.parentElement)
      grandParentOfEditorRoot.prepend(this._textareaContainer)
      this._fitTextareaHeight()
      if (editorRootElem.contains(document.activeElement)) {
        // DM 전송 후 입력칸을 비워준다.
        // 2021-03-18: DM 전송 후 기존 komposer 및 상위요소가 날라가고 새로 생긴다.
        // 그래서 "전송 후 비우기"가 작동하지 않아 대신 "새 komposer에 직전 내용 비우기"식으로 구현함
        if (this.isDM) {
          this.updateText('')
        }
        this.textarea.focus()
        // 크롬에선 위 코드에서 포커스가 가도 입력이 안 되더라.
        // setTimeout으로 다시 focus를 한다...
        setTimeout(() => {
          this.textarea.blur()
          this.textarea.focus()
        }, 250)
      }
    }
    updateText(text: string) {
      this._updateDraftEditorText(text)
      this.textarea.value = text
    }
    // https://www.everythingfrontend.com/posts/insert-text-into-textarea-at-cursor-position.html
    insertAtCursor(textToInsert: string) {
      const { textarea } = this
      const { value, selectionStart, selectionEnd } = textarea
      textarea.value = value.slice(0, selectionStart) + textToInsert + value.slice(selectionEnd)
      textarea.selectionStart = textarea.selectionEnd = selectionStart + textToInsert.length
      this._updateDraftEditorText(textarea.value)
      this._fitTextareaHeight()
    }
    _getDraftEditorText(): string {
      return this._draftjsEditorState.getCurrentContent().getPlainText()
    }
    _updateDraftEditorText(text: string) {
      const { _draftjsEditorState: draftjsEditorState } = this
      const conts = draftjsEditorState.getCurrentContent().constructor.createFromText(text)
      const edits = draftjsEditorState.constructor.createWithContent(conts)
      this._draftjsEditor.update(edits)
    }
    _initializeTextarea() {
      const { textarea } = this
      textarea.className = 'komposer'
      textarea.title = '(Komposer 확장기능을 적용했습니다.)'
      textarea.placeholder = this._getPlaceholderText()
      textarea.value = this._getDraftEditorText()
      this._textareaContainer.appendChild(textarea)
    }
    _initializeEvents() {
      const { textarea } = this
      textarea.addEventListener('keypress', (event: KeyboardEvent) => {
        // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
        event.stopPropagation()
        const { code } = event
        if (code === 'Enter') {
          const how = this._handleEnterKey(event)
          if (how !== 'LineBreak') {
            event.preventDefault()
          }
          switch (how) {
            case 'SendDM':
              this._sendDM()
              break
            case 'SendTweet':
              this._sendTweet()
              break
          }
        }
      })
      textarea.addEventListener('input', () => {
        this._fitTextareaHeight()
        this._updateDraftEditorText(this.textarea.value)
      })
      textarea.addEventListener('paste', (event: ClipboardEvent) => {
        const { clipboardData } = event
        if (!clipboardData) {
          return
        }
        const textData = clipboardData.getData('text')
        if (textData) {
          return
        }
        const onPaste = getReactEventHandler(force(this._editorContentElem.parentElement))?.children
          ?.props?.onPaste
        if (typeof onPaste === 'function') {
          onPaste(event)
        }
      })
      textarea.addEventListener('dragover', (event: DragEvent) => {
        // 요게 없으면 드롭이 안되더라.
        event.stopPropagation()
      })
      textarea.addEventListener('drop', (event: DragEvent) => {
        event.stopPropagation()
        const dropTarget = force(this._getDropTarget())
        const onDrop = getReactEventHandler(dropTarget)?.onDrop
        if (typeof onDrop !== 'function') {
          throw new TypeError('onDrop function is missing')
        }
        const items = event.dataTransfer?.items
        const isMedia = items && items[0] && !items[0].type.startsWith('text/')
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
    }
    _getPlaceholderText(): string {
      let placeholder = this.isDM ? '새 쪽지 보내기' : '무슨 일이 일어나고 있나요?'
      const placeholderElem = this._editorRootElem.querySelector(
        '.public-DraftEditorPlaceholder-root'
      )
      if (placeholderElem) {
        const { textContent } = placeholderElem
        if (textContent) {
          placeholder = textContent
        }
      } else {
        // 2021-03-20 DM 전송 후 새로 생기는 Komposer 입력칸에선
        // 위의 방법으로 placeholder를 찾지 못한더라.
        try {
          const ph = getReactEventHandler(force(this._editorRootElem.parentElement))?.children
            ?.props?.placeholder
          if (typeof ph === 'string') {
            placeholder = ph
          }
        } catch (e) {}
      }
      return placeholder
    }
    _getDropTarget() {
      const parentOfEditorRoot = this._editorRootElem.parentElement
      if (!(parentOfEditorRoot instanceof HTMLElement)) {
        throw new TypeError('parentOfEditorRoot is missing')
      }
      return closestWith(parentOfEditorRoot, elem => {
        const onDrop = getReactEventHandler(elem)?.onDrop
        return typeof onDrop === 'function'
      })
    }
    _fitTextareaHeight() {
      const { textarea } = this
      textarea.style.height = '2px'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
    _handleEnterKey(event: KeyboardEvent): HowToHandleEnterKey {
      if (event.code !== 'Enter') {
        throw new Error('I can only handle Enter key')
      }
      const { ctrlKey, shiftKey } = event
      if (this.isDM) {
        if (shiftKey) {
          return 'LineBreak'
        } else {
          return 'SendDM'
        }
      } else {
        if (ctrlKey) {
          return 'SendTweet'
        } else {
          return 'LineBreak'
        }
      }
    }
    _sendTweet() {
      const grandParentOfEditorRoot = force(this._editorRootElem.parentElement?.parentElement)
      const grandProps = getReactEventHandler(grandParentOfEditorRoot)?.children?.props
      if (!grandProps) {
        throw new Error('fail to get grandProps')
      }
      const { sendTweetCommandName, keyCommandHandlers } = grandProps
      const sendTweetFn = keyCommandHandlers[sendTweetCommandName]
      return sendTweetFn()
    }
    _sendDM() {
      const sendDMButton = document.querySelector('[data-testid="dmComposerSendButton"]')
      if (!(sendDMButton instanceof HTMLElement)) {
        throw new TypeError('dmComposerSendButton is missing')
      }
      const disabled = sendDMButton.getAttribute('aria-disabled') === 'true'
      if (disabled) {
        return
      }
      sendDMButton.click()
      this._fitTextareaHeight()
    }
  }

  class KomposerSuggester {
    /*flow-include
    _suggestArea: HTMLElement
    _items: Array<User | Topic>
    _indices: Indices
    _cursor: number
    _currentText: string
    _hashflags: HashFlagsObj
    _komposer: Komposer
    */
    constructor(komposer: Komposer) {
      this._suggestArea = document.createElement('div')
      this._items = []
      this._indices = [0, 0]
      this._cursor = 0
      this._currentText = ''
      this._hashflags = {}
      this._komposer = komposer
      this._suggestArea.className = 'komposer-suggest-area'
      this._loadHashFlagsStore()
    }
    _hasSuggestItems() {
      return this._items.length > 0
    }
    connect() {
      const debouncedSuggest = _.debounce(this._suggest.bind(this), 500)
      // 화살표키를 한 번 눌렀는데도 커서가 두 번 이동하는 경우가 있더라.
      // debounce 걸어서 막음
      const debouncedMoveCursor = _.debounce(this._moveCursor.bind(this), 100, {
        leading: true,
        trailing: false,
      })
      const { textarea } = this._komposer
      // $FlowIssue
      textarea.addEventListener(EVENT_ACCEPT_SUGGEST, (event: CustomEvent) => {
        const { indices, word }: AcceptedSuggest = event.detail
        this._clear()
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
          this._komposer.updateText(after)
          textarea.focus()
          textarea.selectionStart = textarea.selectionEnd = afterCursor
        }, 50)
      })
      textarea.addEventListener('input', () => {
        debouncedSuggest(textarea)
      })
      textarea.addEventListener('keydown', (event: KeyboardEvent) => {
        const { code } = event
        if (!this._hasSuggestItems()) {
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
            this._clear()
            break
          case 'Enter':
            this._acceptSuggestOnCursor()
            break
        }
        this._renderCursor(this._cursor)
      })
      textarea.addEventListener('blur', () => {
        // 여기서 clear를 즉시 호출하면 마우스클릭으로 제안항목을 선택하는 게 안된다.
        setTimeout(() => this._clear(), 100)
      })
      document.body?.appendChild(this._suggestArea)
    }
    _moveCursor(cur: number) {
      if (!this._hasSuggestItems()) {
        return
      }
      const length = this._items.length
      const maxCursor = length - 1
      let newCursor = this._cursor + cur
      if (newCursor < 0) {
        newCursor = 0
      } else if (newCursor > maxCursor) {
        newCursor = maxCursor
      }
      this._cursor = newCursor
    }
    _renderCursor(cursor: number) {
      const items = this._suggestArea.querySelectorAll('.komposer-suggest-item')
      items.forEach((item, index) => {
        if (!(item instanceof HTMLElement)) {
          throw new TypeError('unreachable')
        }
        const selected = index === cursor
        item.classList.toggle('selected', selected)
        if (selected) {
          const overflowedOnTop = this._suggestArea.scrollTop > item.offsetTop
          if (overflowedOnTop) {
            this._suggestArea.scrollTo({
              behavior: 'smooth',
              top: item.offsetTop,
            })
          }
          const overflowedOnBottom =
            this._suggestArea.scrollTop + this._suggestArea.clientHeight <
            item.offsetTop + item.offsetHeight
          if (overflowedOnBottom) {
            this._suggestArea.scrollTo({
              behavior: 'smooth',
              top: item.offsetTop + item.offsetHeight - this._suggestArea.clientHeight,
            })
          }
        }
      })
    }
    _clear() {
      this._items.length = 0
      this._indices = [0, 0]
      this._cursor = 0
      this._currentText = ''
      this._render()
    }
    async _suggest(textarea: HTMLTextAreaElement) {
      const { value: text, selectionEnd: cursor } = textarea
      if (!text) {
        this._clear()
        return
      }
      // 한글 조합(composition)이벤트 등으로 인해 suggest가 여러번 호출되었을 경우
      // 발생할 수 있는 오작동을 막아줌
      if (text === this._currentText) {
        return
      }
      this._clear()
      this._currentText = text
      const entities = twttr.txt.extractEntitiesWithIndices(text)
      const entity = entities.find(entity => entity.indices[1] === cursor)
      if (!entity) {
        this._clear()
        return
      }
      this._indices = entity.indices
      let result: TypeaheadResult
      if ('screenName' in entity) {
        // $FlowIssue
        const screenName = entity.screenName.toLowerCase()
        if (userSuggestionsCache.has(screenName)) {
          result = force(userSuggestionsCache.get(screenName))
        } else {
          result = await TypeaheadAPI.typeaheadUserNames(screenName, text)
          userSuggestionsCache.set(screenName, result)
        }
      } else if ('hashtag' in entity) {
        // $FlowIssue
        const hashtag = entity.hashtag.toLowerCase()
        if (hashtagSuggestionsCache.has(hashtag)) {
          result = force(hashtagSuggestionsCache.get(hashtag))
        } else {
          result = await TypeaheadAPI.typeaheadHashTags(hashtag, text)
          hashtagSuggestionsCache.set(hashtag, result)
        }
      } else {
        this._clear()
        return
      }
      let count = 1
      for (const userOrTopic of [...result.users, ...result.topics]) {
        this._items.push(userOrTopic)
        if (++count > 10) {
          break
        }
      }
      this._render()
    }
    _createUserItem(user: User): HTMLElement {
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
        // $FlowIssue
        nickNameLabel.innerHTML += VERIFIED_BADGE
      }
      if (user.is_protected) {
        // $FlowIssue
        nickNameLabel.innerHTML += PROTECTED_ICON
      }
      const userNameLabel = label.appendChild(document.createElement('div'))
      assign(userNameLabel, {
        textContent: userName,
        className: 'secondary',
      })
      item.addEventListener('click', (event: MouseEvent) => {
        event.preventDefault()
        this._acceptSuggest(userName)
      })
      return item
    }
    _getHashFlag(hashtag: string): HashFlag | null {
      const tagWithoutHash = hashtag.replace(/^#/, '').toLowerCase()
      const flags = this._hashflags[tagWithoutHash]
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
    _createHashtagItem(topic: Topic): HTMLElement {
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
      const hashflag = this._getHashFlag(hashtag)
      if (hashflag) {
        const flagImg = label.appendChild(document.createElement('img'))
        assign(flagImg, {
          src: hashflag.url,
          className: 'hashflag',
        })
      }
      item.addEventListener('click', (event: MouseEvent) => {
        event.preventDefault()
        this._acceptSuggest(hashtag)
      })
      return item
    }
    _acceptSuggestOnCursor() {
      let word = ''
      const currentItem = this._items[this._cursor]
      if ('id_str' in currentItem) {
        // $FlowIssue
        word = '@' + currentItem.screen_name
      } else {
        // $FlowIssue
        word = currentItem.topic
      }
      this._acceptSuggest(word)
    }
    _acceptSuggest(word: string) {
      const detail: AcceptedSuggest = {
        indices: this._indices,
        word,
      }
      const customEvent = new CustomEvent(EVENT_ACCEPT_SUGGEST, { detail })
      this._komposer.textarea.dispatchEvent(customEvent)
      this._clear()
    }
    _render() {
      this._suggestArea.innerHTML = ''
      const { activeElement } = document
      const shouldShow =
        activeElement &&
        this._komposer.textarea.isSameNode(activeElement) &&
        this._hasSuggestItems()
      if (shouldShow) {
        this._suggestArea.style.display = 'block'
        for (const item of this._items) {
          let itemElem: HTMLElement
          if ('id_str' in item) {
            // $FlowIssue
            itemElem = this._createUserItem(item)
          } else {
            // $FlowIssue
            itemElem = this._createHashtagItem(item)
          }
          this._suggestArea.appendChild(itemElem)
        }
      } else {
        this._suggestArea.style.display = 'none'
      }
      this._renderCursor(0)
      this._relocate()
    }
    _relocate() {
      const { textarea } = this._komposer
      const textareaRect = textarea.getBoundingClientRect()
      assign(this._suggestArea.style, {
        // $FlowIssue
        top: `${textareaRect.y + textareaRect.height}px`,
        // $FlowIssue
        left: window.innerWidth > 500 ? `${textareaRect.x}px` : '0', // 화면폭이 좁으면 왼쪽 여백이 오히려 불편함
        maxHeight: `${window.innerHeight - this._suggestArea.offsetTop - 10}px`,
        right: '0px',
      })
    }
    _loadHashFlagsStore() {
      const reactRoot = document.getElementById('react-root')?.children?.[0]
      if (!(reactRoot instanceof HTMLElement)) {
        throw new Error('#react-root is missing')
      }
      const rEventHandler = getReactEventHandler(reactRoot)
      const store = rEventHandler.children.props.children.props.store
      this._hashflags = store.getState().hashflags?.hashflags || {}
    }
    destruct() {
      this._clear()
      this._suggestArea.remove()
    }
  }

  function assign<T>(obj: T, anotherObj: $Shape<T>): void {
    Object.assign(obj, anotherObj)
  }

  function getReactEventHandler(target: Element): any {
    const key = Object.keys(target)
      .filter((k: string) => k.startsWith('__reactEventHandlers'))
      .pop()
    return key ? (target: any)[key] : null
  }

  function* getAddedElementsFromMutations(mutations: MutationRecord[]) {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node instanceof HTMLElement) {
          yield node
        }
      }
    }
  }

  function* getRemovedElementsFromMutations(mutations: MutationRecord[]) {
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
    while (parentElement instanceof HTMLElement) {
      const filterResult = filteringFn(parentElement)
      if (filterResult) {
        return parentElement
      } else {
        parentElement = parentElement.parentElement
      }
    }
    return null
  }

  const sendingEventMap = new WeakMap<HTMLElement, EventHandler>()
  const textareaToKomposerMap = new WeakMap<HTMLTextAreaElement, Komposer>()
  const textareaToSuggesterMap = new WeakMap<HTMLTextAreaElement, KomposerSuggester>()

  function findActiveTextarea(): HTMLTextAreaElement | null {
    let textareas = document.querySelectorAll('textarea.komposer')
    if (textareas.length === 0) {
      return null
    } else if (textareas.length === 1) {
      // $FlowIgnore
      return textareas[0]
    }
    const toolBar = document.querySelector('[data-testid=toolBar]')
    if (!(toolBar instanceof HTMLElement)) {
      return null
    }
    const closest = closestWith(toolBar, elem => {
      textareas = elem.querySelectorAll('textarea.komposer')
      return textareas.length === 1
    })
    if (closest) {
      // $FlowIgnore
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
    document.addEventListener('click', (event: MouseEvent) => {
      const { target } = event
      if (!(target instanceof HTMLElement)) {
        return
      }
      const emojiButton = findEmojiButtonFromTarget(target)
      if (!emojiButton) {
        return
      }
      event.stopPropagation()
      const emojiDataElem = force(emojiButton.parentElement?.parentElement)
      const childOfEmojiDataElem = getReactEventHandler(emojiDataElem)?.children
      // 피부색을 적용할 수 있는 에모지는 activeSkinTone에 값(object)이 들어있고,
      // 그렇지 않은 에모지는 activeSkinTone이 undefined다.
      const activeSkinTone = childOfEmojiDataElem?._owner?.stateNode?.props?.activeSkinTone
      const emoji = childOfEmojiDataElem?.props?.emoji
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
      const komposer = force(textareaToKomposerMap.get(activeTextarea))
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
    const [red, green, blue] = force(hexColor.match(/[0-9a-f]{2}/gi)).map(hex => parseInt(hex, 16))
    const brightness = red * 299 + green * 587 + blue * 114
    return Math.round(brightness / 1000)
  }

  // DarkReader등의 확장기능 대응을 위해 기존 트위터에 없는 색상이 나타나면
  // 밝기를 구해 색상테마를 맞춘다.
  function toggleNightMode(themeElem: HTMLMetaElement) {
    let themeColor = themeElem.content.toUpperCase()
    const bodyStyleRaw = document.body?.getAttribute('style') || ''
    const darkReaderMatch = /--darkreader-inline-bgcolor:(#[0-9A-Fa-f]{6})/.exec(bodyStyleRaw)
    if (darkReaderMatch) {
      themeColor = darkReaderMatch[1]
    }
    const twitterColors = ['#FFFFFF', '#15202B', '#000000']
    if (!twitterColors.includes(themeColor)) {
      const brightness = getBrightness(themeColor)
      if (brightness > 150) {
        themeColor = '#FFFFFF'
      } else if (brightness > 20) {
        themeColor = '#181A1B'
      } else {
        themeColor = '#000000'
      }
    }
    document.body?.setAttribute('data-komposer-theme', themeColor)
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
    progressbarObserver.observe(force(document.body), {
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    })
  }

  function main() {
    function applyMagicEach(elems) {
      elems.forEach(applyMagic)
    }
    function observerProgressBarEach(elems) {
      elems.forEach(observeProgressBar)
    }
    new MutationObserver(mutations => {
      for (const elem of getAddedElementsFromMutations(mutations)) {
        const editorRootElems = elem.querySelectorAll('.DraftEditor-root')
        applyMagicEach(editorRootElems)
      }
      for (const elem of getRemovedElementsFromMutations(mutations)) {
        // textarea가 사라지면 event를 정리한다
        const textareas = elem.querySelectorAll('textarea.komposer')
        for (const textarea of textareas) {
          if (!(textarea instanceof HTMLTextAreaElement)) {
            throw new TypeError('unreachable')
          }
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
    }).observe(force(document.body), {
      subtree: true,
      characterData: true,
      childList: true,
    })
    applyMagicEach(document.querySelectorAll('.DraftEditor-root'))
    observerProgressBarEach(document.querySelectorAll('[role=progressbar]'))
    integrateEmojiPicker()
    const colorThemeTag = document.querySelector('meta[name="theme-color"]')
    if (colorThemeTag instanceof HTMLMetaElement) {
      toggleNightMode(colorThemeTag)
      new MutationObserver(mutations => {
        if (mutations.length <= 0) {
          return
        }
        const { target } = mutations[0]
        if (!(target instanceof HTMLMetaElement)) {
          throw new TypeError('unreachable')
        }
        toggleNightMode(target)
      }).observe(colorThemeTag, {
        attributeFilter: ['content'],
        attributes: true,
      })
    }
  }

  function initialize() {
    const reactRoot = force(document.getElementById('react-root'))
    if ('_reactRootContainer' in reactRoot) {
      main()
    } else {
      setTimeout(initialize, 500)
    }
  }

  initialize()
}
