// twitter-text
declare namespace twttr {
  export const txt: typeof import('twitter-text')
}

type EventHandler = (event: Event) => void

interface SuggestFromMention {
  type: 'mention'
  value: string
  indices: [number, number]
}

interface SuggestFromHashtag {
  type: 'hashtag'
  value: string
  indices: [number, number]
}

type SuggestFrom = SuggestFromMention | SuggestFromHashtag

interface Topic {
  topic: string
  rounded_score: number
  tokens: Array<{
    token: string
  }>
  [key: string]: any
}

interface User {
  id_str: string
  verified: boolean
  is_blocked: boolean
  name: string
  screen_name: string
  profile_image_url_https: string
  is_protected: boolean
  rounded_score: number
  tokens: Array<{
    token: string
  }>
}

interface TypeaheadResult {
  num_results: number
  query: string
  topics: Topic[]
  users: User[]
}
