import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const preferredRegion = ['iad1']
export const dynamic = 'force-dynamic'

const REQUEST_HEADERS: HeadersInit = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'cache-control': 'max-age=0',
  'upgrade-insecure-requests': '1',
  referer: 'https://www.youtube.com/',
  cookie: 'CONSENT=YES+1; PREF=tz=America.Los_Angeles&f7=4000'
}

const isConsentPage = (html: string): boolean => {
  const head = html.slice(0, 8000)
  return (
    /Before you continue to YouTube/i.test(head) ||
    /consent\.youtube\.com/i.test(head) ||
    /introAgreeButton/i.test(head)
  )
}

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''
  const debug = request.nextUrl.searchParams.get('debug') === 'true'

  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channelId format' }, { status: 400 })
  }

  const log: string[] = []
  const addLog = (msg: string) => {
    if (debug) log.push(msg)
    console.log(`[channel-live] ${msg}`)
  }

  try {
    addLog(`Checking channel: ${channelId}`)

    // The key insight: YouTube auto-redirects /channel/UCxxx/live to /watch?v=xxx when there's a live stream
    // This is how OBS and other tools detect livestreams
    const liveUrl = `https://www.youtube.com/channel/${channelId}/live`
    addLog(`Fetching: ${liveUrl}`)

    const response = await fetch(liveUrl, {
      redirect: 'follow',
      cache: 'no-store',
      headers: REQUEST_HEADERS
    })

    const html = await response.text()
    const finalUrl = response.url

    addLog(`Status: ${response.status}`)
    addLog(`Final URL: ${finalUrl}`)
    addLog(`Content length: ${html.length} bytes`)

    // Check for consent wall
    if (isConsentPage(html)) {
      addLog(`⚠️  Consent page detected - YouTube is blocking access`)
      return NextResponse.json(
        {
          live: false,
          uncertain: true,
          consentRequired: true,
          message: 'YouTube requires consent - cannot check livestream status',
          debug: debug ? log : undefined
        },
        { status: 200 }
      )
    }

    // Primary detection method: URL redirect
    // If URL contains /watch?v=, YouTube redirected us there, meaning there's a live stream
    if (finalUrl.includes('/watch?v=')) {
      const videoIdMatch = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (videoIdMatch?.[1]) {
        const videoId = videoIdMatch[1]
        addLog(`✅ LIVE DETECTED! Video ID: ${videoId}`)
        return NextResponse.json(
          {
            live: true,
            videoId,
            method: 'url-redirect',
            debug: debug ? log : undefined
          },
          { status: 200 }
        )
      }
    }

    // No redirect to /watch means no active livestream
    addLog(`No live stream detected (URL did not redirect to /watch)`)
    return NextResponse.json(
      {
        live: false,
        message: 'No active livestream',
        debug: debug ? log : undefined
      },
      { status: 200 }
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    addLog(`ERROR: ${errorMsg}`)
    console.error('[channel-live] Error checking channel:', error)

    return NextResponse.json(
      {
        live: false,
        uncertain: true,
        error: errorMsg,
        debug: debug ? log : undefined
      },
      { status: 200 }
    )
  }
}
