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
      addLog(`Found ${videoIdMatches.length} video IDs in HTML`)
    }

    // Search for live specific markers
    const hasIsLiveContent = html.includes('"isLiveContent":true')
    const hasIsLiveNow = html.includes('"isLiveNow":true')
    const hasLiveStreamability = html.includes('"liveStreamability"')

    addLog(`"isLiveContent":true found: ${hasIsLiveContent}`)
    addLog(`"isLiveNow":true found: ${hasIsLiveNow}`)
    addLog(`"liveStreamability" found: ${hasLiveStreamability}`)

    // If we find a live marker, extract the first video ID
    if (hasIsLiveContent || hasIsLiveNow || hasLiveStreamability) {
      // Find the video ID associated with the live content
      // Search backwards from the live marker to find the videoId
      const liveIndex = Math.max(
        html.lastIndexOf('"isLiveContent":true'),
        html.lastIndexOf('"isLiveNow":true'),
        html.lastIndexOf('"liveStreamability"')
      )

      if (liveIndex > 0) {
        // Look for videoId in the ~500 chars before the live marker
        const contextBefore = html.substring(Math.max(0, liveIndex - 2000), liveIndex)
        const vidMatch = contextBefore.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/)

        if (vidMatch?.[1]) {
          const videoId = vidMatch[1]
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
        }
      }
    }

    // Diagnostic mode: show HTML snippet for analysis
    if (diagnose === true) {
      const snippet = html.substring(0, 3000)
      addLog(`Diagnostic mode - showing first 3000 chars of HTML`)
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
