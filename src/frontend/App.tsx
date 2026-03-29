import { FormEvent, useState } from 'react'
import {
  APP_TITLE,
  FAILURE_COPY,
  FAILURE_TITLE,
  INITIAL_SCENE,
  INTRO_BUTTON_LABEL,
  INTRO_COPY,
  INTRO_PERSONA,
  RESTART_BUTTON_LABEL,
  SEND_BUTTON_LABEL,
  SUCCESS_COPY,
  SUCCESS_TITLE,
  INTRO_PERSONA_2,
  INTRO_PERSONA_3,
  ASK_BUTTON_LABEL,
  ADVICE_ROLE_LABEL,
} from './gameCopy'
import type {
  AdviceResponse,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  GameStage,
} from '../shared/chat'
import ooshimaVideo from './assets/movie/ooshima.mp4'
import sorajiro from './assets/img/sorajiro.png'

type Phase = 'intro' | 'chat' | 'ending'
type EndingKind = 'accessed' | 'timed_out' | null

const INITIAL_ERROR = null
const TOTAL_LIMIT_MINUTES = 72 * 60
const STAGE_ORDER: GameStage[] = [
  'initial',
  'info_found',
  'pharmacy_arrived',
  'pill_perchased',
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

async function postAdvice(body: ChatRequest): Promise<AdviceResponse> {
  const response = await fetch('/api/advice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await response.json().catch(() => null)) as
    | AdviceResponse
    | { error?: string }
    | null

  if (!response.ok || !data || !('advice' in data)) {
    const message =
      data && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'アドバイスを取得できませんでした。'
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
  const [isAdviceVisible, setIsAdviceVisible] = useState(false)
  const [isAdviceLoading, setIsAdviceLoading] = useState(false)

  const canSend =
    input.trim().length > 0 && !isLoading && !isAdviceLoading && phase === 'chat'
  const canAsk = !isLoading && !isAdviceLoading && phase === 'chat'

  function startGame() {
    setMessages([{ role: 'assistant', content: INITIAL_SCENE }])
    setElapsedMinutes(0)
    setCurrentStage('initial')
    setEndingKind(null)
    setInput('')
    setError(INITIAL_ERROR)
    setIsLoading(false)
    setIsAdviceVisible(false)
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
      setIsAdviceVisible(false)
      
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

      setMessages((currentMessages) => [
        ...currentMessages.filter((message) => message.role !== 'advice'),
        assistantMessage,
      ])
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
    setIsAdviceVisible(false)
  }

  async function handleAskAdvice() {
    setError(INITIAL_ERROR)
    setIsAdviceVisible(true)
    const gameMessages = messages.filter((message) => message.role !== 'advice')
    setMessages(gameMessages)
    setIsAdviceLoading(true)

    try {
      const { advice } = await postAdvice({
        messages: gameMessages,
        elapsedMinutes,
        currentStage,
      })
      setMessages([
        ...gameMessages,
        { role: 'advice', content: advice },
      ])
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'アドバイスの取得に失敗しました。',
      )
    } finally {
      setIsAdviceLoading(false)
    }
  }

  const endingTitle =
    endingKind === 'accessed' ? SUCCESS_TITLE : FAILURE_TITLE
  const endingCopy = endingKind === 'accessed' ? SUCCESS_COPY : FAILURE_COPY

  return (
    <main className="app-shell">
      <section className="panel">
        <h1>{APP_TITLE}</h1>

        {phase === 'intro' ? (
          <div className="stack">
            <p className="lead">{INTRO_COPY}</p>
            <p className="lead">{INTRO_PERSONA}</p>
            <video
              autoPlay
              className="intro-video"
              controls
              muted
              playsInline
              preload="metadata"
              src={ooshimaVideo}
            >
              お使いのブラウザは動画の再生に対応していません。
            </video>
            <p className="lead">{INTRO_PERSONA_2}</p>
            <p className="lead">{INTRO_PERSONA_3}</p>
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
              {messages
                .filter((message) => message.role !== 'advice')
                .map((message, index) => (
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
            {isAdviceVisible ? (
              <div className="advice-log">
                <img className="advice-image" src={sorajiro} alt="そらジロー" />
                <div className="advice-log-messages">
                  {isAdviceLoading ? (
                    <article className="message advice pending">
                      <p className="message-role">{ADVICE_ROLE_LABEL}</p>
                      <p>考えています...</p>
                    </article>
                  ) : null}
                  {messages
                    .filter((message) => message.role === 'advice')
                    .map((message, index) => (
                      <article
                        key={`advice-${index}`}
                        className="message advice"
                      >
                        <p className="message-role">{ADVICE_ROLE_LABEL}</p>
                        <p>{message.content}</p>
                      </article>
                    ))}
                </div>
              </div>
            ) : null}
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
                <div className="composer-footer-buttons">
                  <button
                    className="primary-button"
                    disabled={!canAsk}
                    onClick={() => {
                      void handleAskAdvice()
                    }}
                    type="button"
                  >
                    {isAdviceLoading ? '生成中...' : ASK_BUTTON_LABEL}
                  </button>
                  <button
                    className="primary-button"
                    disabled={!canSend}
                    type="submit"
                  >
                    {isLoading ? '送信中...' : SEND_BUTTON_LABEL}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}

        {phase === 'ending' ? (
          <div className="stack">
            <p className="eyebrow">{endingTitle}</p>
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
