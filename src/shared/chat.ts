export type ChatRole = 'user' | 'assistant'

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

