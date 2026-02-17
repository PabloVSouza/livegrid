import { NextRequest, NextResponse } from 'next/server'

const CHANNEL_ID_REGEX = /UC[\w-]{22}/

const decodeHtml = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

const extractChannelId = (html: string): string | null => {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})["']/i,
    /"channelId":"(UC[\w-]{22})"/,
    /"externalId":"(UC[\w-]{22})"/
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

const extractTitle = (html: string): string | null => {
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title>([^<]+)<\/title>/i
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return decodeHtml(match[1].trim().replace(/\s*-\s*YouTube$/i, ''))
    }
  }

  return null
}

const normalizeYoutubeUrl = (input: string): URL | null => {
  const raw = input.trim()
  if (!raw) return null

  if (/^UC[\w-]{22}$/.test(raw)) {
    return new URL(`https://www.youtube.com/channel/${raw}`)
  }

  if (/^@[^\s]+$/u.test(raw)) {
    return new URL(`https://www.youtube.com/${raw}`)
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    try {
      parsed = new URL(`https://www.youtube.com/${raw.replace(/^\/+/, '')}`)
    } catch {
      return null
    }
  }

  if (!parsed.hostname.includes('youtube.com')) {
    return null
  }

  parsed.protocol = 'https:'
  if (!parsed.hostname.startsWith('www.')) {
    parsed.hostname = 'www.youtube.com'
  }

  return parsed
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') || ''
  const normalized = normalizeYoutubeUrl(rawUrl)

  if (!normalized) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
  }

  const directChannel = normalized.pathname.match(/\/channel\/(UC[\w-]{22})/)
  if (directChannel?.[1]) {
    return NextResponse.json({ channelId: directChannel[1] })
  }

  try {
    const response = await fetch(normalized.toString(), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      redirect: 'follow',
      cache: 'no-store'
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch channel page (${response.status})` }, { status: 502 })
    }

    const html = await response.text()
    const channelId = extractChannelId(html)

    if (!channelId || !CHANNEL_ID_REGEX.test(channelId)) {
      return NextResponse.json({ error: 'Could not resolve channel ID from URL' }, { status: 404 })
    }

    const title = extractTitle(html)
    return NextResponse.json({ channelId, title })
  } catch (error) {
    console.error('Resolve channel error:', error)
    return NextResponse.json({ error: 'Failed to resolve channel' }, { status: 500 })
  }
}
