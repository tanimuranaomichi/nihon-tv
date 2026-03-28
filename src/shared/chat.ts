export type ChatRole = 'user' | 'assistant' | 'advice'
export type ChatMessage = {
  role: ChatRole
  content: string
}

export type ChatRequest = {
  messages: ChatMessage[]
  completedConditionIds: string[]
}

export type ChatResponse = {
  reply: string
  newlyCompletedConditionIds: string[]
  didWin: boolean
}

/** `/api/advice` — GM の直近発言に対するプレイヤー向けヒント */
export type AdviceResponse = {
  advice: string
}

