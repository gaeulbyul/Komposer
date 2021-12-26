export const EVENT_SENDING = 'Komposer::SENDING'
export const EVENT_ACCEPT_SUGGEST = 'Komposer::ACCEPT_SUGGEST'

export function assign<T>(obj: T, anotherObj: Partial<T>): void {
  Object.assign(obj, anotherObj)
}

export function getReactEventHandler(target: Element): any {
  const key = Object.keys(target)
    .filter((k: string) => k.startsWith('__reactEventHandlers'))
    .pop()
  return key ? (target as any)[key] : null
}

export function closestWith(
  elem: HTMLElement,
  filteringFn: (elem: HTMLElement) => boolean,
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
