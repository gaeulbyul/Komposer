import debounce from 'lodash-es/debounce'
import { closestWith, getReactEventHandler } from './common'

export default class Komposer {
  private readonly editorContentElem: HTMLElement
  private readonly draftjsEditor: any
  private readonly draftjsEditorState: any
  private readonly textareaContainer: HTMLElement
  private readonly _type: KomposerType
  textarea: HTMLTextAreaElement
  get type(): KomposerType {
    return this._type
  }
  get disabled(): boolean {
    return this.textarea.disabled
  }
  set disabled(value: boolean) {
    this.textarea.disabled = value
  }
  public constructor(private readonly editorRootElem: HTMLElement) {
    this.textareaContainer = document.createElement('div')
    this.textarea = document.createElement('textarea')
    // (특히 DM에서) 처음 생성될 때 입력칸 높이가 불필요하게 크더라.
    // 최초에 여기서 1px로 하고, applyKomposer 함수에서 _fitTextareaHeight 호출해서
    // 높이를 맞춘다.
    this.textarea.style.height = '1px'
    this.editorContentElem = editorRootElem.querySelector<HTMLElement>(
      '.DraftEditor-editorContainer > div[contenteditable=true]',
    )!
    const { editor, editorState } = getReactEventHandler(this.editorContentElem).children[0].props
    if (this.editorContentElem.getAttribute('data-testid') === 'dmComposerTextInput') {
      this._type = 'DM'
    } else if (editorRootElem.matches('[role=search] .DraftEditor-root')) {
      this._type = 'Search'
    } else {
      this._type = 'Tweet'
    }
    this.draftjsEditor = editor
    this.draftjsEditorState = editorState
    this.initializeTextarea()
    this.initializeEvents()
  }
  private isApplied() {
    return this.editorRootElem.classList.contains('komposer-applied')
  }
  public applyKomposer() {
    const { editorRootElem } = this
    if (this.isApplied()) {
      return
    }
    editorRootElem.classList.add('komposer-applied')
    const parentOfEditorRoot = editorRootElem.parentElement
    if (!(parentOfEditorRoot instanceof HTMLElement)) {
      throw new TypeError('parentOfEditorRoot is missing?')
    }
    let lookingGlassIcon = null
    if (this.type === 'Search') {
      lookingGlassIcon = editorRootElem.closest('label')?.children[0]
    }
    parentOfEditorRoot.hidden = true
    const grandParentOfEditorRoot = parentOfEditorRoot.parentElement!
    grandParentOfEditorRoot.prepend(this.textareaContainer)
    this.fitTextareaHeight()
    if (lookingGlassIcon) {
      const label = editorRootElem.closest('label')
      label?.prepend(lookingGlassIcon)
    }
    if (editorRootElem.contains(document.activeElement)) {
      if (this.type === 'DM') {
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
    // return this._draftjsEditor.props.editorState.getCurrentContent().getPlainText()
  }
  private updateDraftEditorText(text: string) {
    const { draftjsEditorState: draftjsEditorState } = this
    const conts = draftjsEditorState.getCurrentContent().constructor.createFromText(text)
    const edits = draftjsEditorState.constructor.createWithContent(conts)
    this.draftjsEditor.update(edits)
  }
  private initializeTextarea() {
    const { textarea } = this
    textarea.className = 'komposer'
    textarea.title = '(Komposer 확장기능을 적용했습니다.)'
    textarea.placeholder = this.getPlaceholderText()
    textarea.value = this.getDraftEditorText()
    this.textareaContainer.appendChild(textarea)
  }
  private initializeEvents() {
    const { textarea } = this
    const debouncedUpdateDraftEditorText = debounce((text: string) => {
      this.updateDraftEditorText(text)
    }, 100)
    textarea.addEventListener('keypress', (event: KeyboardEvent) => {
      // 슬래시 등 일부 문자에서 단축키로 작동하는 것을 막음
      event.stopPropagation()
      const { code } = event
      if (code === 'Enter') {
        debouncedUpdateDraftEditorText.flush()
        const how = this.handleEnterKey(event)
        if (how !== 'LineBreak') {
          event.preventDefault()
        }
        switch (how) {
          case 'SendDM':
            this.sendDM()
            break
          case 'SendTweet':
            this.sendTweet()
            break
          case 'Submit':
            this.submitSearch()
            break
          case 'Ignore':
            break
        }
      }
    })
    textarea.addEventListener('input', () => {
      this.fitTextareaHeight()
      debouncedUpdateDraftEditorText(this.textarea.value)
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
      const onPaste = getReactEventHandler(this.editorContentElem.parentElement!)?.children?.props
        ?.onPaste
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
      const dropTarget = this.getDropTarget()!
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
  private getPlaceholderText(): string {
    let placeholder = this.type === 'DM' ? '새 쪽지 보내기' : '무슨 일이 일어나고 있나요?'
    const placeholderElem = this.editorRootElem.querySelector('.public-DraftEditorPlaceholder-root')
    if (placeholderElem) {
      const { textContent } = placeholderElem
      if (textContent) {
        placeholder = textContent
      }
    } else {
      // 2021-03-20 DM 전송 후 새로 생기는 Komposer 입력칸에선
      // 위의 방법으로 placeholder를 찾지 못한더라.
      try {
        const ph = getReactEventHandler(this.editorRootElem.parentElement!)?.children?.props
          ?.placeholder
        if (typeof ph === 'string') {
          placeholder = ph
        }
      } catch {}
    }
    return placeholder
  }
  private getDropTarget() {
    const parentOfEditorRoot = this.editorRootElem.parentElement
    if (!(parentOfEditorRoot instanceof HTMLElement)) {
      throw new TypeError('parentOfEditorRoot is missing')
    }
    return closestWith(parentOfEditorRoot, elem => {
      const onDrop = getReactEventHandler(elem)?.onDrop
      return typeof onDrop === 'function'
    })
  }
  private fitTextareaHeight() {
    const { textarea } = this
    textarea.style.height = '2px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }
  private handleEnterKey(event: KeyboardEvent): HowToHandleEnterKey {
    if (event.code !== 'Enter') {
      throw new Error('I can only handle Enter key')
    }
    // metaKey = macOS에서의 Command 키
    const { ctrlKey, shiftKey, metaKey } = event
    switch (this.type) {
      case 'DM':
        if (shiftKey) {
          return 'LineBreak'
        } else if (metaKey) {
          return 'Ignore'
        } else {
          return 'SendDM'
        }
      case 'Tweet':
        if (ctrlKey || metaKey) {
          return 'SendTweet'
        } else {
          return 'LineBreak'
        }
      case 'Search':
        return 'Submit'
    }
  }
  private sendTweet() {
    const grandParentOfEditorRoot = this.editorRootElem.parentElement?.parentElement!
    const grandProps = getReactEventHandler(grandParentOfEditorRoot)?.children?.props
    if (!grandProps) {
      throw new Error('fail to get grandProps')
    }
    const { sendTweetCommandName, keyCommandHandlers } = grandProps
    const sendTweetFn = keyCommandHandlers[sendTweetCommandName]
    return sendTweetFn()
  }
  private sendDM() {
    const sendDMButton = document.querySelector('[data-testid="dmComposerSendButton"]')
    if (!(sendDMButton instanceof HTMLElement)) {
      throw new TypeError('dmComposerSendButton is missing')
    }
    const disabled = sendDMButton.getAttribute('aria-disabled') === 'true'
    if (disabled) {
      return
    }
    sendDMButton.click()
    // updateText를 곧바로 하면 DM전송 실패하더라.
    // setTimeout으로 약간의 딜레이를 준다. (1은 너무 짧다..)
    // 이 때, 딜레이 도중 텍스트 수정을 막기 위해 임시로 readOnly를 걸어둔다.
    this.textarea.readOnly = true
    setTimeout(() => {
      try {
        this.updateText('')
        this.fitTextareaHeight()
      } finally {
        this.textarea.readOnly = false
        this.textarea.focus()
      }
    }, 250)
  }
  private submitSearch() {
    const form = this.textarea.closest('form')!
    form.requestSubmit()
  }
}
