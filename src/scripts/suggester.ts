import debounce from 'lodash-es/debounce'
import throttle from 'lodash-es/throttle'
import twitterText from 'twitter-text'

import type Komposer from './komposer'
import TypeaheadAPI from './typeahead'
import { EVENT_ACCEPT_SUGGEST, assign, getReactEventHandler } from './common'
import { VERIFIED_BADGE, PROTECTED_ICON } from './badges'

const userSuggestionsCache = new Map<string, TypeaheadResult>()
const hashtagSuggestionsCache = new Map<string, TypeaheadResult>()

export default class KomposerSuggester {
  private readonly items: Array<User | Topic>
  private indices: Indices
  private cursor: number
  private currentText: string
  private hashflags: HashFlagsObj
  public constructor(
    private readonly komposer: Komposer,
    private readonly suggestArea: HTMLElement
  ) {
    this.items = []
    this.indices = [0, 0]
    this.cursor = 0
    this.currentText = ''
    this.hashflags = {}
    this.suggestArea.className = 'komposer-suggest-area'
    this.loadHashFlagsStore()
  }
  private hasSuggestItems() {
    return this.items.length > 0
  }
  public connect() {
    const debouncedSuggest = debounce(textarea => this.suggest(textarea), 500)
    // 화살표키를 한 번 눌렀는데도 커서가 두 번 이동하는 경우가 있더라.
    // debounce 걸어서 막음
    const debouncedMoveCursor = throttle(direction => this.moveCursor(direction), 100, {
      leading: true,
      trailing: false,
    })
    const { textarea } = this.komposer
    textarea.addEventListener(EVENT_ACCEPT_SUGGEST, (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        throw new Error('unreachable')
      }
      const { indices, word }: AcceptedSuggest = event.detail
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
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
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
    textarea.addEventListener('blur', () => {
      // 여기서 clear를 즉시 호출하면 마우스클릭으로 제안항목을 선택하는 게 안된다.
      setTimeout(() => this.clear(), 100)
    })
    document.body?.appendChild(this.suggestArea)
  }
  private moveCursor(cur: number) {
    if (!this.hasSuggestItems()) {
      return
    }
    const length = this.items.length
    const maxCursor = length - 1
    let newCursor = this.cursor + cur
    if (newCursor < 0) {
      newCursor = 0
    } else if (newCursor > maxCursor) {
      newCursor = maxCursor
    }
    this.cursor = newCursor
  }
  private renderCursor(cursor: number) {
    const items = this.suggestArea.querySelectorAll<HTMLElement>('.komposer-suggest-item')
    items.forEach((item, index) => {
      const selected = index === cursor
      item.classList.toggle('selected', selected)
      if (selected) {
        const overflowedOnTop = this.suggestArea.scrollTop > item.offsetTop
        if (overflowedOnTop) {
          this.suggestArea.scrollTo({
            behavior: 'smooth',
            top: item.offsetTop,
          })
        }
        const overflowedOnBottom =
          this.suggestArea.scrollTop + this.suggestArea.clientHeight <
          item.offsetTop + item.offsetHeight
        if (overflowedOnBottom) {
          this.suggestArea.scrollTo({
            behavior: 'smooth',
            top: item.offsetTop + item.offsetHeight - this.suggestArea.clientHeight,
          })
        }
      }
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
    this.clear()
    this.currentText = text
    const entities = twitterText.extractEntitiesWithIndices(text)
    const entity = entities.find(entity => entity.indices[1] === cursor)
    if (!entity) {
      this.clear()
      return
    }
    this.indices = entity.indices
    let result: TypeaheadResult
    if ('screenName' in entity) {
      // $FlowIssue
      const screenName = entity.screenName.toLowerCase()
      if (userSuggestionsCache.has(screenName)) {
        result = userSuggestionsCache.get(screenName)!
      } else {
        result = await TypeaheadAPI.typeaheadUserNames(screenName, text)
        userSuggestionsCache.set(screenName, result)
      }
    } else if ('hashtag' in entity) {
      // $FlowIssue
      const hashtag = entity.hashtag.toLowerCase()
      if (hashtagSuggestionsCache.has(hashtag)) {
        result = hashtagSuggestionsCache.get(hashtag)!
      } else {
        result = await TypeaheadAPI.typeaheadHashTags(hashtag, text)
        hashtagSuggestionsCache.set(hashtag, result)
      }
    } else {
      this.clear()
      return
    }
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
    item.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault()
      this.acceptSuggest(hashtag)
    })
    return item
  }
  private acceptSuggestOnCursor() {
    let word = ''
    const currentItem = this.items[this.cursor]
    if ('id_str' in currentItem) {
      // $FlowIssue
      word = '@' + currentItem.screen_name
    } else {
      // $FlowIssue
      word = currentItem.topic
    }
    this.acceptSuggest(word)
  }
  private acceptSuggest(word: string) {
    const detail: AcceptedSuggest = {
      indices: this.indices,
      word,
    }
    const customEvent = new CustomEvent(EVENT_ACCEPT_SUGGEST, { detail })
    this.komposer.textarea.dispatchEvent(customEvent)
    this.clear()
  }
  private render() {
    this.suggestArea.innerHTML = ''
    const { activeElement } = document
    const shouldShow =
      activeElement && this.komposer.textarea.isSameNode(activeElement) && this.hasSuggestItems()
    if (shouldShow) {
      this.suggestArea.style.display = 'block'
      for (const item of this.items) {
        let itemElem: HTMLElement
        if ('id_str' in item) {
          // $FlowIssue
          itemElem = this.createUserItem(item)
        } else {
          // $FlowIssue
          itemElem = this.createHashtagItem(item)
        }
        this.suggestArea.appendChild(itemElem)
      }
    } else {
      this.suggestArea.style.display = 'none'
    }
    this.renderCursor(0)
    this.relocate()
  }
  private relocate() {
    const { textarea } = this.komposer
    const textareaRect = textarea.getBoundingClientRect()
    assign(this.suggestArea.style, {
      // $FlowIssue
      top: `${textareaRect.y + textareaRect.height}px`,
      // $FlowIssue
      left: window.innerWidth > 500 ? `${textareaRect.x}px` : '0', // 화면폭이 좁으면 왼쪽 여백이 오히려 불편함
      maxHeight: `${window.innerHeight - this.suggestArea.offsetTop - 10}px`,
      right: '0px',
    })
  }
  private loadHashFlagsStore() {
    const reactRoot = document.getElementById('react-root')?.children?.[0]
    if (!(reactRoot instanceof HTMLElement)) {
      throw new Error('#react-root is missing')
    }
    const rEventHandler = getReactEventHandler(reactRoot)
    const store = rEventHandler.children.props.children.props.store
    this.hashflags = store.getState().hashflags?.hashflags || {}
  }
  public destruct() {
    this.clear()
  }
}
