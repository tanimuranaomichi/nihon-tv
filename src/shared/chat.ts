export type ChatRole = 'user' | 'assistant' | 'advice'
export type ChatMessage = {
  role: ChatRole
  content: string
}

export type GameStage =
  | 'initial'
  | 'info_found'
  | 'pharmacy_arrived'
  | 'pill_perchased'
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

/** `/api/advice` — GM の直近発言に対するプレイヤー向けヒント */
export type AdviceResponse = {
  advice: string
}
