import { NextRequest, NextResponse } from 'next/server'

const VIDEO_ID_REGEX = /[\w-]{11}/
const CONSENT_HOST = 'consent.youtube.com'

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

const isConsentInterstitialHtml = (html: string): boolean => {
  const head = html.slice(0, 12000)
  return (
    /Before you continue to YouTube/i.test(head) ||
    /consent\.youtube\.com\/m\?/i.test(head) ||
    /introAgreeButton/i.test(head)
  )
}

const fetchHtml = async (
  url: string
): Promise<{ responseUrl: string; html: string; status: number }> => {
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    headers: REQUEST_HEADERS
  })
  const html = await response.text()

  // Debug logging
  console.log(`[channel-live] Fetched ${url} -> ${response.url}`)
  console.log(`[channel-live] Status: ${response.status}, Size: ${html.length}`)

  return { responseUrl: response.url, html, status: response.status }
}

const extractVideoId = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)

    if (parsed.pathname === '/watch') {
      const v = parsed.searchParams.get('v') || undefined
      if (v && VIDEO_ID_REGEX.test(v)) {
        return v
      }
    }

    const short = parsed.pathname.match(/^\/live\/([\w-]{11})$/)
    if (short?.[1]) {
      return short[1]
    }

    return undefined
  } catch {
    return undefined
  }
}

const extractWatchEndpointVideoId = (html: string): string | undefined =>
  html.match(/\"watchEndpoint\"\s*:\s*\{[^}]*\"videoId\"\s*:\s*\"([\w-]{11})\"/)?.[1]

const extractJsonObjectAfter = (source: string, marker: string): string | null => {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) return null

  const start = source.indexOf('{', markerIndex + marker.length)
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, i + 1)
      }
    }
  }

  return null
}

interface InitialPlayerResponse {
  videoDetails?: {
    videoId?: string
    channelId?: string
    isLiveContent?: boolean
    isUpcoming?: boolean
  }
  playabilityStatus?: {
    status?: string
    reason?: string
    liveStreamability?: unknown
  }
  microformat?: {
    playerMicroformatRenderer?: {
      liveBroadcastDetails?: {
        isLiveNow?: boolean
      }
    }
  }
  streamingData?: {
    hlsManifestUrl?: string
  }
}

const extractInitialPlayerResponse = (html: string): InitialPlayerResponse | null => {
  const markers = ['var ytInitialPlayerResponse =', 'ytInitialPlayerResponse =']

  for (const marker of markers) {
    const payload = extractJsonObjectAfter(html, marker)
    if (!payload) continue

    try {
      return JSON.parse(payload) as InitialPlayerResponse
    } catch {
      // try next marker
    }
  }

  return null
}

const extractLiveIndicatorsFromHtml = (html: string): { isLive: boolean; videoId?: string } => {
  // Check for live content indicators in various places

  // 1. Check for "isLiveContent":true in the HTML
  const isLiveContentMatch = html.match(/"isLiveContent":\s*true/)
  if (isLiveContentMatch) {
    // Extract video ID if possible
    const videoIdMatch = html.match(/"videoId":"([\w-]{11})"/)
    return { isLive: true, videoId: videoIdMatch?.[1] }
  }

  // 2. Check for live manifest or streaming indicators
  const hasLiveManifest = /hlsManifestUrl|dashManifestUrl/.test(html)
  if (hasLiveManifest) {
    const videoIdMatch = html.match(/"videoId":"([\w-]{11})"/)
    return { isLive: true, videoId: videoIdMatch?.[1] }
  }

  // 3. Check for "isUpcoming":true to filter out scheduled streams
  const isUpcomingMatch = html.match(/"isUpcoming":\s*true/)
  if (isUpcomingMatch) {
    return { isLive: false }
  }

  return { isLive: false }
}

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''
  const debug = request.nextUrl.searchParams.get('debug') === 'true'

  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channelId' }, { status: 400 })
  }

  const liveUrl = new URL(`https://www.youtube.com/channel/${channelId}/live`)
  liveUrl.searchParams.set('hl', 'en')
  liveUrl.searchParams.set('gl', 'US')
  liveUrl.searchParams.set('persist_hl', '1')
  liveUrl.searchParams.set('ucbcb', '1')
  liveUrl.searchParams.set('has_verified', '1')

  const debugLog: string[] | undefined = debug ? [] : undefined

  try {
    if (debugLog) debugLog.push(`Starting check for ${channelId}`)
    let fetched = await fetchHtml(liveUrl.toString())
    if (debugLog) debugLog.push(`Fetched: ${fetched.responseUrl}, status: ${fetched.status}, size: ${fetched.html.length}`)

    const redirectedHost = (() => {
      try {
        return new URL(fetched.responseUrl).hostname
      } catch {
        return ''
      }
    })()

    if (redirectedHost.includes(CONSENT_HOST)) {
      if (debugLog) debugLog.push(`Detected consent redirect, attempting to follow`)
      try {
        const consentUrl = new URL(fetched.responseUrl)
        const continueUrl = consentUrl.searchParams.get('continue')
        if (continueUrl) {
          const decodedContinue = decodeURIComponent(continueUrl)
          fetched = await fetchHtml(decodedContinue)
          if (debugLog) debugLog.push(`Followed consent redirect: ${fetched.responseUrl}`)
        }
      } catch (err) {
        if (debugLog) debugLog.push(`Consent redirect failed: ${err}`)
        // Continue with the consent page content - might still have partial data
      }
    } else if (isConsentInterstitialHtml(fetched.html)) {
      // Even if not redirected, check if content is a consent page
      if (debugLog) debugLog.push(`Detected consent in HTML`)
      return NextResponse.json({ live: false, uncertain: true, debug: debugLog })
    }

    const redirectedVideoId = extractVideoId(fetched.responseUrl)
    if (redirectedVideoId) {
      if (debugLog) debugLog.push(`Found video ID in URL: ${redirectedVideoId}`)
      return NextResponse.json({ live: true, videoId: redirectedVideoId, debug: debugLog })
    }

    if (fetched.status >= 400) {
      if (debugLog) debugLog.push(`HTTP error: ${fetched.status}`)
      return NextResponse.json({ live: false, uncertain: true, debug: debugLog })
    }

    const html = fetched.html

    const player = extractInitialPlayerResponse(html)
    if (debugLog) {
      debugLog.push(`ytInitialPlayerResponse found: ${!!player}`)
      if (player) {
        debugLog.push(`  videoId: ${player.videoDetails?.videoId}`)
        debugLog.push(`  isLiveContent: ${player.videoDetails?.isLiveContent}`)
        debugLog.push(`  isUpcoming: ${player.videoDetails?.isUpcoming}`)
        debugLog.push(`  isLiveNow: ${player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow}`)
        debugLog.push(`  liveStreamability: ${!!player.playabilityStatus?.liveStreamability}`)
        debugLog.push(`  hlsManifestUrl: ${!!player.streamingData?.hlsManifestUrl}`)
      }
    }

    if (player?.videoDetails?.videoId && VIDEO_ID_REGEX.test(player.videoDetails.videoId)) {
      // Safety check: avoid picking unrelated recommended videos from page blobs.
      if (player.videoDetails.channelId && player.videoDetails.channelId !== channelId) {
        if (debugLog) debugLog.push(`Channel mismatch: expected ${channelId}, got ${player.videoDetails.channelId}`)
        return NextResponse.json({ live: false, uncertain: true, debug: debugLog })
      }

      const isLiveNow =
        player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow === true
      const isLiveContent = player.videoDetails.isLiveContent === true
      const isUpcoming = player.videoDetails.isUpcoming === true
      const hasLiveStreamability = Boolean(player.playabilityStatus?.liveStreamability)
      const hasLiveManifest = Boolean(player.streamingData?.hlsManifestUrl)

      // isLiveContent is true for both upcoming AND currently-live streams
      // We need to exclude upcoming streams to avoid false positives
      const isActuallyLive = isLiveContent && !isUpcoming
      const isLiveSignal = isLiveNow || isActuallyLive || hasLiveStreamability || hasLiveManifest

      if (debugLog) debugLog.push(`Live signals: isLiveNow=${isLiveNow}, isActuallyLive=${isActuallyLive}, hasStreamability=${hasLiveStreamability}, hasManifest=${hasLiveManifest}`)

      if (isLiveSignal) {
        if (debugLog) debugLog.push(`Detected as LIVE`)
        return NextResponse.json({ live: true, videoId: player.videoDetails.videoId, debug: debugLog })
      }
    }

    // Fallback: try alternative detection if ytInitialPlayerResponse is missing
    if (debugLog) debugLog.push(`Trying alternative detection methods`)
    const altDetection = extractLiveIndicatorsFromHtml(html)
    if (debugLog) debugLog.push(`Alternative detection: isLive=${altDetection.isLive}, videoId=${altDetection.videoId}`)
    
    if (altDetection.isLive && altDetection.videoId) {
      if (debugLog) debugLog.push(`Alternative detection found live stream`)
      return NextResponse.json({ live: true, videoId: altDetection.videoId, debug: debugLog })
    }

    // If parsing succeeds but no clear "live now" marker exists, treat as explicit offline.
    if (/watch\?v=/.test(html)) {
      if (debugLog) debugLog.push(`Found watch URL, marking as offline`)
      return NextResponse.json({ live: false, debug: debugLog })
    }

    if (debugLog) debugLog.push(`No live signals found, returning uncertain`)
    return NextResponse.json({ live: false, uncertain: true, debug: debugLog })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (debugLog) debugLog.push(`FATAL ERROR: ${errorMsg}`)
    console.error('[channel-live] Channel live check error for', channelId, ':', error)
    return NextResponse.json({ live: false, uncertain: true, debug: debugLog, error: errorMsg })
  }
}
