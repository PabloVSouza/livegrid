import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const preferredRegion = ['iad1']
export const dynamic = 'force-dynamic'

const CHANNEL_ID_REGEX = /^UC[\w-]{22}$/

const REQUEST_HEADERS: HeadersInit = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1'
}

const isConsentInterstitial = (html: string): boolean => {
  const head = html.slice(0, 12000)
  return /Before you continue to YouTube/i.test(head) || /introAgreeButton/i.test(head)
}

const extractMainLiveVideoId = (html: string): string | undefined => {
  // Use the page command for /channel/.../live target to avoid picking random videoIds from huge blobs.
  return html.match(
    /window\['ytCommand'\]\s*=\s*\{[\s\S]*?"watchEndpoint"\s*:\s*\{\s*"videoId"\s*:\s*"([\w-]{11})"[\s\S]*?\};/
  )?.[1]
}

const hasLiveSignals = (html: string): boolean => {
  return (
    /"isLiveNow"\s*:\s*true/.test(html) ||
    /"isLiveHeadPlayable"\s*:\s*true/.test(html) ||
    /"isLiveDvrEnabled"\s*:\s*true/.test(html) ||
    /"isLive"\s*:\s*true/.test(html)
  )
}

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''
  const debug = request.nextUrl.searchParams.get('debug') === 'true'

  if (!CHANNEL_ID_REGEX.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channelId format' }, { status: 400 })
  }

  const logs: string[] = []
  const log = (message: string) => {
    if (debug) logs.push(message)
  }

  try {
    const liveUrl = `https://www.youtube.com/channel/${channelId}/live`
    const response = await fetch(liveUrl, {
      redirect: 'follow',
      cache: 'no-store',
      headers: REQUEST_HEADERS
    })

    const finalUrl = response.url
    const html = await response.text()

    log(`status=${response.status}`)
    log(`url=${finalUrl}`)
    log(`htmlLen=${html.length}`)

    const finalHost = (() => {
      try {
        return new URL(finalUrl).hostname
      } catch {
        return ''
      }
    })()

    if (finalHost.includes('consent.youtube.com') || isConsentInterstitial(html)) {
      log('consent=1')
      return NextResponse.json(
        {
          live: false,
          uncertain: true,
          consentRequired: true,
          message: 'YouTube consent gate',
          debug: debug ? logs : undefined
        },
        { status: 200 }
      )
    }

    const videoId = extractMainLiveVideoId(html)
    const live = hasLiveSignals(html)

    log(`videoId=${videoId ?? 'none'}`)
    log(`liveSignals=${live ? '1' : '0'}`)

    if (live && videoId) {
      return NextResponse.json(
        {
          live: true,
          videoId,
          method: 'ytCommand+liveSignals',
          debug: debug ? logs : undefined
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        live: false,
        debug: debug ? logs : undefined
      },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return NextResponse.json(
      {
        live: false,
        uncertain: true,
        error: message,
        debug: debug ? [...logs, `error=${message}`] : undefined
      },
      { status: 200 }
    )
  }
}
