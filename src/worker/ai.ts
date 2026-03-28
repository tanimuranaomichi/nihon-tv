import type { ChatMessage, ChatResponse } from '../shared/chat'
import { MODEL, SYSTEM_PROMPT, VICTORY_CONDITIONS } from './gameConfig'

type AiBinding = {
  run: (
    model: string,
    options: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
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
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
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
  const result = await ai.run(MODEL, {
    messages: buildMessages(messages, completedConditionIds),
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
      ...messages,
      {
        role: 'user' as const,
        content:
          '前回の出力形式が不正でした。指定された JSON object だけを返してください。',
      },
    ]

    return invokeModel(ai, retryMessages, completedConditionIds)
  }
}
