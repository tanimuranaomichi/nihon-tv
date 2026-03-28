import { FormEvent, useState } from 'react'
import {
  APP_TITLE,
  ENDING_HAPPY_COPY,
  ENDING_SAD_COPY,
  ENDING_HAPPY_TITLE,
  ENDING_SAD_TITLE,
  INTRO_BUTTON_LABEL,
  INTRO_COPY,
  INTRO_PERSONA,
  RESTART_BUTTON_LABEL,
  SEND_BUTTON_LABEL,
} from './gameCopy'
import type { ChatMessage, ChatRequest, ChatResponse } from '../shared/chat'

type Phase = 'intro' | 'chat' | 'ending'

const INITIAL_ERROR = null

async function postChat(body: ChatRequest): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await response.json().catch(() => null)) as
    | ChatResponse
    | { error?: string }
    | null

  if (!response.ok || !data || !('reply' in data)) {
    const message =
      data && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'AI からの応答を取得できませんでした。'
    throw new Error(message)
  }

  return data
}

function mergeCompletedConditionIds(
  previous: string[],
  incoming: string[],
): string[] {
  return [...new Set([...previous, ...incoming])]
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [completedConditionIds, setCompletedConditionIds] = useState<string[]>(
    [],
  )
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(INITIAL_ERROR)

  const canSend = input.trim().length > 0 && !isLoading && phase === 'chat'

  function startGame() {
    setMessages([])
    setCompletedConditionIds([])
    setInput('')
    setError(INITIAL_ERROR)
    setIsLoading(false)
    setPhase('chat')
    setMessages([{ role: 'assistant', content: '1+1は？' }])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = input.trim()
    if (!trimmed || isLoading) {
      return
    }

    const nextUserMessage: ChatMessage = { role: 'user', content: trimmed }
    const nextMessages = [...messages, nextUserMessage]

    setMessages(nextMessages)
    setInput('')
    setError(INITIAL_ERROR)
    setIsLoading(true)

    try {
      const response = await postChat({
        messages: nextMessages,
        completedConditionIds,
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
      }
      const nextCompletedConditionIds = mergeCompletedConditionIds(
        completedConditionIds,
        response.newlyCompletedConditionIds,
      )

      setMessages((currentMessages) => [...currentMessages, assistantMessage])
      setCompletedConditionIds(nextCompletedConditionIds)

      if (response.didWin) {
        setPhase('ending')
      }
    } catch (caughtError) {
      setMessages(messages)
      setInput(trimmed)
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'メッセージの送信に失敗しました。',
      )
    } finally {
      setIsLoading(false)
    }
  }

  function resetGame() {
    setPhase('intro')
    setMessages([])
    setCompletedConditionIds([])
    setInput('')
    setIsLoading(false)
    setError(INITIAL_ERROR)
  }

  const latestAssistantMessage =
    [...messages].reverse().find((message) => message.role === 'assistant')
      ?.content ?? ''

  return (
    <main className="app-shell">
      <section className="panel">
        <h1>{APP_TITLE}</h1>

        {phase === 'intro' ? (
          <div className="stack">
            <p className="lead">{INTRO_COPY}</p>
            <p className="lead">{INTRO_PERSONA}</p>
            <button
              className="primary-button"
              disabled={isLoading}
              onClick={() => {
                void startGame()
              }}
              type="button"
            >
              {isLoading ? '開始中...' : INTRO_BUTTON_LABEL}
            </button>
          </div>
        ) : null}

        {phase === 'chat' ? (
          <div className="stack">
            <div className="chat-log" aria-live="polite">
              {messages.map((message, index) => (
                <article
                  key={`${message.role}-${index}`}
                  className={`message ${message.role}`}
                >
                  <p className="message-role">
                    {message.role === 'assistant' ? 'GM' : 'Player'}
                  </p>
                  <p>{message.content}</p>
                </article>
              ))}

              {isLoading ? (
                <article className="message assistant pending">
                  <p className="message-role">GM</p>
                  <p>考えています...</p>
                </article>
              ) : null}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="player-input">
                プレイヤー入力
              </label>
              <textarea
                id="player-input"
                name="player-input"
                onChange={(event) => setInput(event.target.value)}
                placeholder="回答を入力"
                rows={3}
                value={input}
              />
              <div className="composer-footer">
                <p className="meta">
                  達成済み条件: {completedConditionIds.length}
                </p>
                <button
                  className="primary-button"
                  disabled={!canSend}
                  type="submit"
                >
                  {isLoading ? '送信中...' : SEND_BUTTON_LABEL}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {phase === 'ending' ? (
          <div className="stack">
            <h2 className="ending-text">{ENDING_HAPPY_TITLE}</h2>
            <p className="lead">{ENDING_HAPPY_COPY}</p>
            <button
              className="primary-button"
              onClick={resetGame}
              type="button"
            >
              {RESTART_BUTTON_LABEL}
            </button>
          </div>
        ) : null}

        {/* TODO: 失敗時のエンディングを追加 */}
        {/* {phase === 'ending' ? (
          <div className="stack">
            <p className="eyebrow">{ENDING_SAD_TITLE}</p>
            <h2 className="ending-text">{latestAssistantMessage}</h2>
            <p className="lead">{ENDING_SAD_COPY}</p>
            <button
              className="primary-button"
              onClick={resetGame}
              type="button"
            >
              {RESTART_BUTTON_LABEL}
            </button>
          </div>
        ) : null} */}

        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </main>
  )
}
