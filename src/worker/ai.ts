import type { ChatMessage, ChatResponse } from '../shared/chat'
import {
  ADVICE_SYSTEM_PROMPT,
  MODEL,
  SYSTEM_PROMPT,
  VICTORY_CONDITIONS,
} from './gameConfig'

type AiBinding = {
  run: (
    model: string,
    options: {
      messages: Array<{ role: 'system' | 'user' | 'assistant' | 'advice'; content: string }>
      response_format?: {
        type: 'json_schema'
        json_schema: unknown
      }
      max_tokens?: number
      temperature?: number
    },
  ) => Promise<unknown>
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    newlyCompletedConditionIds: {
      type: 'array',
      items: { type: 'string' },
    },
    didWin: { type: 'boolean' },
  },
  required: ['reply', 'newlyCompletedConditionIds', 'didWin'],
  additionalProperties: false,
} as const

const ADVICE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    advice: { type: 'string' },
  },
  required: ['advice'],
  additionalProperties: false,
} as const

function withoutAdviceMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role !== 'advice')
}

function getCurrentQuestion(completedConditionIds: string[]): string {
  if (!completedConditionIds.includes('answer-first-question')) {
    return '1+1は？'
  }

  if (!completedConditionIds.includes('answer-second-question')) {
    return '2*3は？'
  }

  return 'すべての問題は完了しています。'
}

function buildMessages(
  messages: ChatMessage[],
  completedConditionIds: string[],
): Array<{ role: 'system' | 'user' | 'assistant' | 'advice'; content: string }> {
  const victoryConditionBlock = VICTORY_CONDITIONS.map(
    (condition) => `- ${condition.id}: ${condition.description}`,
  ).join('\n')

  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'system',
      content: `勝利条件一覧:\n${victoryConditionBlock}`,
    },
    {
      role: 'system',
      content: `すでに達成済みの条件ID: ${
        completedConditionIds.length > 0
          ? completedConditionIds.join(', ')
          : '(なし)'
      }`,
    },
    {
      role: 'system',
      content: `現在プレイヤーに答えさせるべき問題: ${getCurrentQuestion(
        completedConditionIds,
      )}`,
    },
    {
      role: 'system',
      content:
        '返答形式は {"reply": string, "newlyCompletedConditionIds": string[], "didWin": boolean} の JSON object のみです。',
    },
    ...messages,
  ]
}

function isChatResponse(value: unknown): value is ChatResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.reply === 'string' &&
    typeof candidate.didWin === 'boolean' &&
    Array.isArray(candidate.newlyCompletedConditionIds) &&
    candidate.newlyCompletedConditionIds.every((id) => typeof id === 'string')
  )
}

function normalizeAiResponse(result: unknown): ChatResponse {
  if (isChatResponse(result)) {
    return result
  }

  if (typeof result === 'object' && result !== null && 'response' in result) {
    const response = (result as { response: unknown }).response

    if (isChatResponse(response)) {
      return response
    }

    if (typeof response === 'string') {
      const parsed = JSON.parse(response) as unknown
      if (isChatResponse(parsed)) {
        return parsed
      }
    }
  }

  if (typeof result === 'string') {
    const parsed = JSON.parse(result) as unknown
    if (isChatResponse(parsed)) {
      return parsed
    }
  }

  throw new Error('AI response shape is invalid')
}

function sanitizeResponse(
  response: ChatResponse,
  completedConditionIds: string[],
): ChatResponse {
  const validConditionIds = new Set<string>(
    VICTORY_CONDITIONS.map((condition) => condition.id),
  )
  const alreadyCompleted = new Set(completedConditionIds)

  const newlyCompletedConditionIds = response.newlyCompletedConditionIds.filter(
    (conditionId) =>
      validConditionIds.has(conditionId) && !alreadyCompleted.has(conditionId),
  )

  const allCompleted = new Set([...completedConditionIds, ...newlyCompletedConditionIds])
  const didWin = VICTORY_CONDITIONS.every((condition) => allCompleted.has(condition.id))

  return {
    reply: response.reply.trim(),
    newlyCompletedConditionIds,
    didWin,
  }
}

async function invokeModel(
  ai: AiBinding,
  messages: ChatMessage[],
  completedConditionIds: string[],
): Promise<ChatResponse> {
  const gameMessages = withoutAdviceMessages(messages)
  const result = await ai.run(MODEL, {
    messages: buildMessages(gameMessages, completedConditionIds),
    response_format: {
      type: 'json_schema',
      json_schema: RESPONSE_SCHEMA,
    },
    max_tokens: 256,
    temperature: 0,
  })

  const normalized = normalizeAiResponse(result)
  return sanitizeResponse(normalized, completedConditionIds)
}

export async function generateGameResponse(
  ai: AiBinding,
  messages: ChatMessage[],
  completedConditionIds: string[],
): Promise<ChatResponse> {
  try {
    return await invokeModel(ai, messages, completedConditionIds)
  } catch {
    const retryMessages = [
      ...withoutAdviceMessages(messages),
      {
        role: 'user' as const,
        content:
          '前回の出力形式が不正でした。指定された JSON object だけを返してください。',
      },
    ]

    return invokeModel(ai, retryMessages, completedConditionIds)
  }
}

function isAdvicePayload(value: unknown): value is { advice: string } {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.advice === 'string'
}

function normalizeAdviceResponse(result: unknown): string {
  if (isAdvicePayload(result)) {
    return result.advice.trim()
  }

  if (typeof result === 'object' && result !== null && 'response' in result) {
    const response = (result as { response: unknown }).response

    if (isAdvicePayload(response)) {
      return response.advice.trim()
    }

    if (typeof response === 'string') {
      const parsed = JSON.parse(response) as unknown
      if (isAdvicePayload(parsed)) {
        return parsed.advice.trim()
      }
    }
  }

  if (typeof result === 'string') {
    const parsed = JSON.parse(result) as unknown
    if (isAdvicePayload(parsed)) {
      return parsed.advice.trim()
    }
  }

  throw new Error('Advice response shape is invalid')
}

function buildAdviceMessages(
  messages: ChatMessage[],
): Array<{ role: 'system' | 'user'; content: string }> {
  const gameMessages = withoutAdviceMessages(messages)
  const lastAssistant = [...gameMessages]
    .reverse()
    .find((message) => message.role === 'assistant')

  if (!lastAssistant) {
    throw new Error('GM の発言がありません。')
  }

  const transcript = gameMessages
    .map((message) =>
      message.role === 'user'
        ? `プレイヤー: ${message.content}`
        : `GM: ${message.content}`,
    )
    .join('\n')

  return [
    {
      role: 'system',
      content: ADVICE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: `これまでの会話:\n${transcript}\n\n直近の GM の発言（この発言に返答するヒントを出してください）:\n${lastAssistant.content}\n\n返答は {"advice":"..."} 形式の JSON object のみです。`,
    },
  ]
}

export async function generateAdvice(ai: AiBinding, messages: ChatMessage[]): Promise<string> {
  const result = await ai.run(MODEL, {
    messages: buildAdviceMessages(messages),
    response_format: {
      type: 'json_schema',
      json_schema: ADVICE_RESPONSE_SCHEMA,
    },
    max_tokens: 256,
    temperature: 0.4,
  })

  return normalizeAdviceResponse(result)
}
