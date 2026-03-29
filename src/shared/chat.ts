export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type GameStage =
  | 'initial'
  | 'info_found'
  | 'island_unavailable_found'
  | 'returned_home'
  | 'accessed'

export type ChatRequest = {
  messages: ChatMessage[]
  elapsedMinutes: number
  currentStage: GameStage
}

export type ChatResponse = {
  reply: string
  elapsedMinutes: 30 | 60 | 180
  shouldAdvanceStage: boolean
}
