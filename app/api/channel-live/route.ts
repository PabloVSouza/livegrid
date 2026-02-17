import { NextRequest, NextResponse } from 'next/server'

const VIDEO_ID_REGEX = /[\w-]{11}/
const CONSENT_HOST = 'consent.youtube.com'

export const runtime = 'nodejs'
export const preferredRegion = ['iad1']
export const dynamic = 'force-dynamic'

const REQUEST_HEADERS: HeadersInit = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+917'
}

const fetchHtml = async (url: string): Promise<{ responseUrl: string; html: string; status: number }> => {
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    headers: REQUEST_HEADERS
  })
  const html = await response.text()
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

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''

  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channelId' }, { status: 400 })
  }

  const liveUrl = new URL(`https://www.youtube.com/channel/${channelId}/live`)
  liveUrl.searchParams.set('hl', 'en')
  liveUrl.searchParams.set('gl', 'US')
  liveUrl.searchParams.set('persist_hl', '1')
  liveUrl.searchParams.set('ucbcb', '1')
  liveUrl.searchParams.set('has_verified', '1')

  try {
    let fetched = await fetchHtml(liveUrl.toString())

    const redirectedHost = (() => {
      try {
        return new URL(fetched.responseUrl).hostname
      } catch {
        return ''
      }
    })()
    if (redirectedHost.includes(CONSENT_HOST)) {
      try {
        const consentUrl = new URL(fetched.responseUrl)
        const continueUrl = consentUrl.searchParams.get('continue')
        if (continueUrl) {
          const decodedContinue = decodeURIComponent(continueUrl)
          fetched = await fetchHtml(decodedContinue)
        }
      } catch {
        // ignore and keep fallback below
      }
    }

    const redirectedVideoId = extractVideoId(fetched.responseUrl)
    if (redirectedVideoId) {
      return NextResponse.json({ live: true, videoId: redirectedVideoId })
    }

    if (fetched.status >= 400) {
      return NextResponse.json({ live: false, uncertain: true })
    }

    const html = fetched.html
    if (/consent\.youtube\.com/i.test(html)) {
      return NextResponse.json({ live: false, uncertain: true })
    }

    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    const canonicalVideoId = canonical ? extractVideoId(canonical) : undefined

    const liveMatchA = html.match(/\"videoId\":\"([\w-]{11})\"[\s\S]{0,1200}\"isLiveNow\":true/)
    if (liveMatchA?.[1] && VIDEO_ID_REGEX.test(liveMatchA[1])) {
      return NextResponse.json({ live: true, videoId: liveMatchA[1] })
    }

    const liveMatchB = html.match(/\"isLiveNow\":true[\s\S]{0,1200}\"videoId\":\"([\w-]{11})\"/)
    if (liveMatchB?.[1] && VIDEO_ID_REGEX.test(liveMatchB[1])) {
      return NextResponse.json({ live: true, videoId: liveMatchB[1] })
    }

    const canonicalBase = html.match(/\"canonicalBaseUrl\":\"\\\/watch\\\?v=([\w-]{11})\"/)
    if (canonicalBase?.[1] && /\"isLiveNow\":true/.test(html)) {
      return NextResponse.json({ live: true, videoId: canonicalBase[1] })
    }

    const endpointVideoId = html.match(/\"watchEndpoint\"\\s*:\\s*\\{[^}]*\"videoId\"\\s*:\\s*\"([\w-]{11})\"/)?.[1]
    if (endpointVideoId && /\"isLiveNow\":true/.test(html)) {
      return NextResponse.json({ live: true, videoId: endpointVideoId })
    }

    const liveSignalsPresent =
      /\"isLiveHeadPlayable\":true/.test(html) ||
      /\"isLiveDvrEnabled\":true/.test(html) ||
      /\"isLive\":true/.test(html)
    if (liveSignalsPresent) {
      const bestVideoId =
        endpointVideoId ||
        extractWatchEndpointVideoId(html) ||
        canonicalVideoId
      if (bestVideoId && VIDEO_ID_REGEX.test(bestVideoId)) {
        return NextResponse.json({ live: true, videoId: bestVideoId })
      }
    }

    // If parsing succeeds but no clear "live now" marker exists, treat as explicit offline.
    if (/watch\?v=/.test(html)) {
      return NextResponse.json({ live: false })
    }

    return NextResponse.json({ live: false, uncertain: true })
  } catch (error) {
    console.error('Channel live check error:', error)
    return NextResponse.json({ live: false, uncertain: true })
  }
}
