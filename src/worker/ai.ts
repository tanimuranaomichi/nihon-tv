import type { ChatMessage, ChatResponse, GameStage } from '../shared/chat'
import {
  MODEL,
  STAGE_CONFIGS,
  SYSTEM_PROMPT,
} from './gameConfig'

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

type RawChatResponse = {
  reply: string
  elapsedMinutes: number
  shouldAdvanceStage: boolean
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    elapsedMinutes: {
      type: 'integer',
      enum: [30, 60, 180],
    },
    shouldAdvanceStage: { type: 'boolean' },
  },
  required: ['reply', 'elapsedMinutes', 'shouldAdvanceStage'],
  additionalProperties: false,
} as const

function buildMessages(
  messages: ChatMessage[],
  elapsedMinutes: number,
  currentStage: GameStage,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const remainingMinutes = Math.max(0, 72 * 60 - elapsedMinutes)
  const isEvening = elapsedMinutes >= 4 * 60

  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    {
      role: 'system',
      content: `開始からの経過時間: ${elapsedMinutes}分`,
    },
    {
      role: 'system',
      content: `残り時間: ${remainingMinutes}分`,
    },
    {
      role: 'system',
      content: `夕方以降か: ${isEvening ? 'はい' : 'いいえ'}`,
    },
    {
      role: 'system',
      content: `現在のstage: ${currentStage} (${STAGE_CONFIGS[currentStage].description})`,
    },
    {
      role: 'system',
      content: `このターンで stage を進めてよい条件: ${STAGE_CONFIGS[currentStage].advanceRule}`,
    },
    {
      role: 'system',
      content:
        '返答形式は {"reply": string, "elapsedMinutes": 30 | 60 | 180, "shouldAdvanceStage": boolean} の JSON object のみです。',
    },
    ...messages,
  ]
}

function isRawChatResponse(value: unknown): value is RawChatResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.reply === 'string' &&
    typeof candidate.elapsedMinutes === 'number' &&
    typeof candidate.shouldAdvanceStage === 'boolean'
  )
}

function normalizeAiResponse(result: unknown): RawChatResponse {
  if (isRawChatResponse(result)) {
    return result
  }

  if (typeof result === 'object' && result !== null && 'response' in result) {
    const response = (result as { response: unknown }).response

    if (isRawChatResponse(response)) {
      return response
    }

    if (typeof response === 'string') {
      const parsed = JSON.parse(response) as unknown
      if (isRawChatResponse(parsed)) {
        return parsed
      }
    }
  }

  if (typeof result === 'string') {
    const parsed = JSON.parse(result) as unknown
    if (isRawChatResponse(parsed)) {
      return parsed
    }
  }

  throw new Error('AI response shape is invalid')
}

function normalizeReply(
  reply: string,
  currentStage: GameStage,
  shouldAdvanceStage: boolean,
): string {
  const trimmed = reply.trim()
  if (!trimmed) {
    return '状況はまだはっきりしません。不安が強まる中、どうしますか？'
  }

  const isAccessEnding = currentStage === 'returned_home' && shouldAdvanceStage
  if (isAccessEnding || trimmed.endsWith('どうしますか？')) {
    return trimmed
  }

  return `${trimmed} どうしますか？`
}

function sanitizeResponse(
  response: RawChatResponse,
  currentStage: GameStage,
): ChatResponse {
  const elapsedMinutes =
    response.elapsedMinutes === 30 ||
    response.elapsedMinutes === 60 ||
    response.elapsedMinutes === 180
      ? response.elapsedMinutes
      : 30

  return {
    reply: normalizeReply(
      response.reply,
      currentStage,
      response.shouldAdvanceStage,
    ),
    elapsedMinutes,
    shouldAdvanceStage:
      currentStage === 'accessed' ? false : response.shouldAdvanceStage,
  }
}

async function invokeModel(
  ai: AiBinding,
  messages: ChatMessage[],
  elapsedMinutes: number,
  currentStage: GameStage,
): Promise<ChatResponse> {
  const result = await ai.run(MODEL, {
    messages: buildMessages(messages, elapsedMinutes, currentStage),
    response_format: {
      type: 'json_schema',
      json_schema: RESPONSE_SCHEMA,
    },
    max_tokens: 300,
    temperature: 0,
  })

  const normalized = normalizeAiResponse(result)
  return sanitizeResponse(normalized, currentStage)
}

export async function generateGameResponse(
  ai: AiBinding,
  messages: ChatMessage[],
  elapsedMinutes: number,
  currentStage: GameStage,
): Promise<ChatResponse> {
  try {
    return await invokeModel(ai, messages, elapsedMinutes, currentStage)
  } catch {
    const retryMessages = [
      ...messages,
      {
        role: 'user' as const,
        content:
          '前回の出力形式が不正でした。指定された JSON object だけを返してください。',
      },
    ]

    return invokeModel(ai, retryMessages, elapsedMinutes, currentStage)
  }
}
