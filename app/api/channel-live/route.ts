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
  const diagnose = request.nextUrl.searchParams.get('diagnose') === 'true'

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
    if (finalUrl.includes('/watch?v=')) {
      const videoIdMatch = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (videoIdMatch?.[1]) {
        const videoId = videoIdMatch[1]
        addLog(`✅ LIVE DETECTED via URL redirect! Video ID: ${videoId}`)
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

    // YouTube now serves the page without redirect - search HTML for video data
    addLog(`No URL redirect. Searching HTML for video data...`)

    // Search for "videoId" with value pattern
    const videoIdMatches = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)
    if (videoIdMatches) {
      addLog(`Found ${videoIdMatches.length} videoId entries in HTML`)
    }

    // Extract the first videoId for fallback
    let firstVideoId: string | undefined
    const firstVidMatch = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/)
    if (firstVidMatch?.[1]) {
      firstVideoId = firstVidMatch[1]
      addLog(`First videoId found: ${firstVideoId}`)
    }

    // Search for live specific markers using regex (with flexible spacing)
    const liveNowMatch = html.match(/"isLiveNow"\s*:\s*true/)
    const liveContentMatch = html.match(/"isLiveContent"\s*:\s*true/)
    const upcomingMatch = html.match(/"isUpcoming"\s*:\s*true/)
    const isLiveMatch = html.match(/"isLive"\s*:\s*true/)
    const statusMatch = html.match(/"status"\s*:\s*"LIVE"/)

    const hasLiveNow = !!liveNowMatch
    const hasLiveContent = !!liveContentMatch
    const hasUpcoming = !!upcomingMatch
    const hasIsLive = !!isLiveMatch
    const hasStatus = !!statusMatch

    addLog(
      `Markers - isLiveNow: ${hasLiveNow}, isLiveContent: ${hasLiveContent}, isUpcoming: ${hasUpcoming}, isLive: ${hasIsLive}, status: ${hasStatus}`
    )

    // Logic - use ONLY the most reliable livestream markers:
    // - isLiveNow=true: Currently streaming (most reliable)
    // - isLive=true: Alternative livestream flag
    // - status="LIVE": YouTube status field
    // - isLiveContent=true AND isUpcoming=false: Live but not scheduled for future
    const isLive = hasLiveNow || hasIsLive || hasStatus || (hasLiveContent && !hasUpcoming)

    if (isLive) {
      addLog(`Live stream detected! Looking for video ID...`)

      // Find the video ID associated with the live content
      let videoId: string | undefined = firstVideoId

      // Search around the live markers for the specific videoId
      const markers = [
        liveNowMatch,
        isLiveMatch,
        statusMatch,
        liveContentMatch
      ].filter(Boolean)

      for (const marker of markers) {
        if (!marker) continue
        const liveIndex = html.indexOf(marker[0])
        const context = html.substring(Math.max(0, liveIndex - 1500), liveIndex + 1000)
        const vidMatch = context.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/)
        if (vidMatch?.[1]) {
          videoId = vidMatch[1]
          addLog(`Found videoId near marker: ${videoId}`)
          break
        }
      }

      if (videoId) {
        addLog(`✅ LIVE DETECTED via HTML markers! Video ID: ${videoId}`)
        return NextResponse.json(
          {
            live: true,
            videoId,
            method: 'html-markers',
            debug: debug ? log : undefined
          },
          { status: 200 }
        )
      } else {
        addLog(`Live markers found but no videoId extracted`)
      }
    }

    // Diagnostic mode: show HTML snippet for analysis
    if (diagnose === true) {
      const snippet = html.substring(0, 15000)
      addLog(`Diagnostic mode - showing first 15000 chars of HTML`)
      return NextResponse.json(
        {
          live: false,
          debug: log,
          htmlSnippet: snippet,
          htmlSize: html.length,
          message: 'Diagnostic mode activated - see htmlSnippet for analysis'
        },
        { status: 200 }
      )
    }

    // No livestream detected
    addLog(`No active livestream found`)
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
