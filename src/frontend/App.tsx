import { FormEvent, useState } from 'react'
import {
  APP_TITLE,
  FAILURE_COPY,
  FAILURE_TITLE,
  INITIAL_SCENE,
  INTRO_BUTTON_LABEL,
  INTRO_COPY,
  RESTART_BUTTON_LABEL,
  SEND_BUTTON_LABEL,
  SUCCESS_COPY,
  SUCCESS_TITLE,
} from './gameCopy'
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  GameStage,
} from '../shared/chat'

type Phase = 'intro' | 'chat' | 'ending'
type EndingKind = 'accessed' | 'timed_out' | null

const INITIAL_ERROR = null
const TOTAL_LIMIT_MINUTES = 72 * 60
const STAGE_ORDER: GameStage[] = [
  'initial',
  'info_found',
  'island_unavailable_found',
  'returned_home',
  'accessed',
]

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

function addElapsedMinutes(currentElapsedMinutes: number, minutes: number): number {
  return currentElapsedMinutes + minutes
}

function isTimedOut(elapsedMinutes: number): boolean {
  return elapsedMinutes > TOTAL_LIMIT_MINUTES
}

function advanceStage(currentStage: GameStage): GameStage {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)
  if (currentIndex < 0 || currentIndex === STAGE_ORDER.length - 1) {
    return currentStage
  }

  return STAGE_ORDER[currentIndex + 1]
}

function formatRemainingTime(elapsedMinutes: number): string {
  const remainingMinutes = Math.max(0, TOTAL_LIMIT_MINUTES - elapsedMinutes)
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60

  return `${hours}時間${minutes}分`
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [elapsedMinutes, setElapsedMinutes] = useState(0)
  const [currentStage, setCurrentStage] = useState<GameStage>('initial')
  const [endingKind, setEndingKind] = useState<EndingKind>(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(INITIAL_ERROR)

  const canSend = input.trim().length > 0 && !isLoading && phase === 'chat'

  function startGame() {
    setMessages([{ role: 'assistant', content: INITIAL_SCENE }])
    setElapsedMinutes(0)
    setCurrentStage('initial')
    setEndingKind(null)
    setInput('')
    setError(INITIAL_ERROR)
    setIsLoading(false)
    setPhase('chat')
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
        elapsedMinutes,
        currentStage,
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
      }
      const nextElapsedMinutes = addElapsedMinutes(
        elapsedMinutes,
        response.elapsedMinutes,
      )
      const nextStage = response.shouldAdvanceStage
        ? advanceStage(currentStage)
        : currentStage

      setMessages((currentMessages) => [...currentMessages, assistantMessage])
      setElapsedMinutes(nextElapsedMinutes)
      setCurrentStage(nextStage)

      if (nextStage === 'accessed') {
        setEndingKind('accessed')
        setPhase('ending')
      } else if (isTimedOut(nextElapsedMinutes)) {
        setEndingKind('timed_out')
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
    setElapsedMinutes(0)
    setCurrentStage('initial')
    setEndingKind(null)
    setInput('')
    setIsLoading(false)
    setError(INITIAL_ERROR)
  }

  const latestAssistantMessage =
    [...messages].reverse().find((message) => message.role === 'assistant')
      ?.content ?? ''

  const endingTitle =
    endingKind === 'accessed' ? SUCCESS_TITLE : FAILURE_TITLE
  const endingCopy = endingKind === 'accessed' ? SUCCESS_COPY : FAILURE_COPY

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Cloudflare Workers AI Demo</p>
        <h1>{APP_TITLE}</h1>

        {phase === 'intro' ? (
          <div className="stack">
            <p className="lead">{INTRO_COPY}</p>
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
                placeholder="次に取る行動を入力"
                rows={3}
                value={input}
              />
              <div className="composer-footer">
                <p className="meta">
                  残り時間: {formatRemainingTime(elapsedMinutes)}
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
            <p className="eyebrow">{endingTitle}</p>
            <h2 className="ending-text">{latestAssistantMessage}</h2>
            <p className="lead">{endingCopy}</p>
            <button
              className="primary-button"
              onClick={resetGame}
              type="button"
            >
              {RESTART_BUTTON_LABEL}
            </button>
          </div>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </main>
  )
}
