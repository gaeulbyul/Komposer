const BEARER_TOKEN = `AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA`

export default class TypeaheadAPI {
  static getCSRFToken() {
    const match = /\bct0=([0-9a-f]+)\b/i.exec(document.cookie)
    if (match && match[1]) {
      return match[1]
    } else {
      throw new Error('Failed to get CSRF token.')
    }
  }

  static generateTwitterAPIOptions(): Partial<RequestInit> {
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
