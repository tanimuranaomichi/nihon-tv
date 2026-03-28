import { Hono } from 'hono'
import type { ChatMessage, ChatRequest } from '../shared/chat'
import { generateGameResponse } from './ai'

type AiBinding = {
  run: (model: string, options: unknown) => Promise<unknown>
}

type AppEnv = {
  Bindings: {
    AI: AiBinding
  }
}

const app = new Hono<AppEnv>()

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  )
}

function parseChatRequest(value: unknown): ChatRequest | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const { messages, completedConditionIds } = candidate

  if (
    !Array.isArray(messages) ||
    !messages.every((message) => isChatMessage(message)) ||
    !Array.isArray(completedConditionIds) ||
    !completedConditionIds.every((id) => typeof id === 'string')
  ) {
    return null
  }

  return {
    messages,
    completedConditionIds,
  }
}

app.post('/api/chat', async (c) => {
  let payload: unknown

  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'JSON ボディが不正です。' }, 400)
  }

  const chatRequest = parseChatRequest(payload)
  if (!chatRequest) {
    return c.json(
      { error: 'messages と completedConditionIds の形式が不正です。' },
      400,
    )
  }

  try {
    const response = await generateGameResponse(
      c.env.AI,
      chatRequest.messages,
      chatRequest.completedConditionIds,
    )

    return c.json(response)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'AI 応答の生成に失敗しました。' }, 500)
  }
})

app.notFound((c) => c.json({ error: 'Not Found' }, 404))

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
