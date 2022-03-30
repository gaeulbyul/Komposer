import { closestWith, EVENT_SENDING, getReactEventHandler } from './common'
import Komposer from './komposer'
import KomposerSuggester from './suggester'

const sendingEventMap = new WeakMap<HTMLElement, EventHandler>()
const textareaToKomposerMap = new WeakMap<HTMLTextAreaElement, Komposer>()
const textareaToSuggesterMap = new WeakMap<HTMLTextAreaElement, KomposerSuggester>()
const emojiClickEventListening = new WeakSet<HTMLElement>()
const dmSendButtonEventListening = new WeakSet<HTMLElement>()

const suggestArea = document.createElement('div')
suggestArea.className = 'komposer-suggest-area'

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

function findActiveTextareas(): HTMLTextAreaElement[] {
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea.komposer'))
  if (textareas.length < 2) {
    return textareas
  }
  textareas.length = 0
  for (const toolBar of document.querySelectorAll('[data-testid=toolBar]')) {
    if (!(toolBar instanceof HTMLElement)) {
      continue
    }
    let textarea: HTMLTextAreaElement | null = null
    closestWith(toolBar, elem => {
      const komposerTextarea = elem.querySelector<HTMLTextAreaElement>('textarea.komposer')
      if (komposerTextarea instanceof HTMLTextAreaElement) {
        textarea = komposerTextarea
        return true
      } else {
        return false
      }
    })
    if (!textarea) {
      continue
    }
    textareas.push(textarea)
  }
  // modal 뒤에 가려진 textarea는 active라고 볼 수 없다.
  // [aria-modal=true]를 통해 거르자.
  const textareasInTheModal = textareas.filter(elem => elem.matches('[aria-modal=true] .komposer'))
  const textareaInDMDrawer = document.querySelector<HTMLTextAreaElement>(
    '[data-testid=DMDrawer] textarea.komposer',
  )
  if (textareaInDMDrawer instanceof HTMLTextAreaElement) {
    // DM서랍과 홈 타임라인 입력칸이 둘 다 존재하는 경우,
    // anchorNode(에모지입력기 버튼을 가리킴)의 위치에 따라 에모지를 입력할 입력칸을 판단한다.
    const emojiPicker = document.getElementById('emoji_picker_categories_dom_id')
    if (emojiPicker) {
      const anchorContained = emojiPicker.parentElement?.parentElement?.parentElement!
      const anchorNode = getReactEventHandler(anchorContained).children._owner.stateNode._anchorNode
      if (anchorNode.matches('[data-testid=DMDrawer] div')) {
        return [textareaInDMDrawer]
      }
    }
  }
  return textareasInTheModal.length > 0 ? textareasInTheModal : textareas
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
  const emojiPicker = document.getElementById('emoji_picker_categories_dom_id')
  if (emojiPicker instanceof HTMLElement) {
    if (!emojiClickEventListening.has(emojiPicker)) {
      emojiClickEventListening.add(emojiPicker)
      emojiPicker.removeEventListener('click', onEmojiButtonClicked)
      emojiPicker.addEventListener('click', onEmojiButtonClicked)
    }
  }
}

function onDMSendButtonClicked(event: MouseEvent) {
  const { target } = event
  // 비행기모양 아이콘일 수도 있으며,
  // 이 경우 event.target은 SVGElement이다.
  if (!(target instanceof Element)) {
    return
  }
  const sendButton = target.closest('[data-testid=dmComposerSendButton]')!
  const disabled = sendButton.getAttribute('aria-disabled') === 'true'
  if (disabled) {
    return
  }
  const container = sendButton.closest('aside[role=complementary]')!
  const dmTextArea = container
    .querySelector<HTMLTextAreaElement>('textarea.komposer[data-komposer-type=DM]')!
  const dmKomposer = textareaToKomposerMap.get(dmTextArea)!
  dmKomposer.clearDM()
}

function interceptDMSendButton() {
  const sendButton = document.querySelector<HTMLElement>('[data-testid=dmComposerSendButton]')
  if (!sendButton) {
    return
  }
  if (dmSendButtonEventListening.has(sendButton)) {
    return
  }
  dmSendButtonEventListening.add(sendButton)
  sendButton.removeEventListener('click', onDMSendButtonClicked)
  sendButton.addEventListener('click', onDMSendButtonClicked)
}

function onEmojiButtonClicked(event: MouseEvent) {
  const { target } = event
  if (!(target instanceof HTMLElement)) {
    return
  }
  const emojiButton = findEmojiButtonFromTarget(target)
  if (!emojiButton) {
    return
  }
  event.stopPropagation()
  const emojiDataElem = emojiButton.parentElement?.parentElement!
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
  findActiveTextareas().forEach(textarea => {
    const komposer = textareaToKomposerMap.get(textarea)!
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
    if (brightness > 150) {
      themeColor = '#FFFFFF'
    } else if (brightness > 20) {
      themeColor = '#181A1B'
    } else {
      themeColor = '#000000'
    }
  }
  document.body.dataset.komposerTheme = themeColor
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
    }),
  )
})

function applyMagic(elem: HTMLElement) {
  const komposer = new Komposer(elem)
  komposer.applyKomposer()
  textareaToKomposerMap.set(komposer.textarea, komposer)
  if (komposer.type === 'Tweet') {
    const suggester = new KomposerSuggester(komposer, suggestArea)
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
  new MutationObserver(mutations => {
    for (const elem of getAddedElementsFromMutations(mutations)) {
      elem.querySelectorAll<HTMLElement>('.DraftEditor-root').forEach(applyMagic)
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
    integrateEmojiPicker()
    interceptDMSendButton()
  }).observe(document.body, {
    subtree: true,
    characterData: true,
    childList: true,
  })
  document.querySelectorAll<HTMLElement>('.DraftEditor-root').forEach(applyMagic)
  document.querySelectorAll<HTMLElement>('[role=progressbar]').forEach(observeProgressBar)
  const colorThemeTag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
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
  // 트윗덱 신버전 여부는 .js-app Element 존재여부로 확인한다.
  const isLegacyTweetDeck = document.querySelector('.js-app')
  if (isLegacyTweetDeck) {
    console.info('구 트윗덱으로 판단. 작동종료')
    return
  }
  const reactRoot = document.getElementById('react-root')
  if (reactRoot && '_reactRootContainer' in reactRoot) {
    main()
  } else {
    setTimeout(initialize, 500)
  }
}

initialize()
