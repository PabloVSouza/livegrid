import { NextRequest, NextResponse } from 'next/server'

const VIDEO_ID_REGEX = /[\w-]{11}/

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

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId')?.trim() || ''

  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channelId' }, { status: 400 })
  }

  const liveUrl = `https://www.youtube.com/channel/${channelId}/live`

  try {
    const response = await fetch(liveUrl, {
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    })

    const redirectedVideoId = extractVideoId(response.url)
    if (redirectedVideoId) {
      return NextResponse.json({ live: true, videoId: redirectedVideoId })
    }

    const html = await response.text()
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    if (canonical) {
      const canonicalVideoId = extractVideoId(canonical)
      if (canonicalVideoId) {
        return NextResponse.json({ live: true, videoId: canonicalVideoId })
      }
    }

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

    return NextResponse.json({ live: false })
  } catch (error) {
    console.error('Channel live check error:', error)
    return NextResponse.json({ error: 'Failed to check live status' }, { status: 500 })
  }
}
