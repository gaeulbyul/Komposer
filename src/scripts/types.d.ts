declare type HowToHandleEnterKey = 'SendTweet' | 'SendDM' | 'LineBreak' | 'Submit'
declare type KomposerType = 'Tweet' | 'DM' | 'Search'

declare type EventHandler = (event: Event) => void
declare type Indices = [number, number]
declare interface SuggestFrom {
  value: string
  indices: Indices
}
declare interface Topic {
  topic: string
  rounded_score: number
  tokens: Array<{
    token: string
  }>
}
declare interface User {
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
declare interface TypeaheadResult {
  num_results: number
  query: string
  topics: Topic[]
  users: User[]
}
declare interface AcceptedSuggest {
  indices: Indices
  word: string
}
declare interface HashFlag {
  url: string
  startMs: number
  endMs: number
}
declare type HashFlagsObj = {
  [tagName: string]: HashFlag[]
}
