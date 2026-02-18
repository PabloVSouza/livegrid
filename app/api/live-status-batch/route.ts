import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const preferredRegion = ['iad1']
export const dynamic = 'force-dynamic'

type StreamPlatform = 'youtube' | 'twitch' | 'kick'

interface BatchSourceInput {
  key: string
  platform: StreamPlatform
  channelId?: string
  channelUrl?: string
}

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

const isYouTubeAntiBotGate = (finalUrl: string, status: number, html: string): boolean => {
  const head = html.slice(0, 12000)
  const lowerUrl = finalUrl.toLowerCase()
  return (
    status === 429 ||
    lowerUrl.includes('google.com/sorry') ||
    /detected unusual traffic/i.test(head) ||
    /verify you are human/i.test(head) ||
    /recaptcha/i.test(head)
  )
}

const extractMainLiveVideoId = (html: string): string | undefined => {
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

const extractRssVideoIds = (xml: string, max = 3): string[] => {
  const ids: string[] = []
  const regex = /<yt:videoId>([\w-]{11})<\/yt:videoId>/g
  let match: RegExpExecArray | null = regex.exec(xml)

  while (match && ids.length < max) {
    if (!ids.includes(match[1])) ids.push(match[1])
    match = regex.exec(xml)
  }

  return ids
}

const checkVideoWatchPageIsLive = async (videoId: string): Promise<boolean | null> => {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const response = await fetch(watchUrl, {
      redirect: 'follow',
      cache: 'no-store',
      headers: REQUEST_HEADERS
    })
    const html = await response.text()

    if (isYouTubeAntiBotGate(response.url, response.status, html)) {
      return null
    }

    return hasLiveSignals(html)
  } catch {
    return null
  }
}

const checkYoutubeLiveViaRssFallback = async (channelId: string) => {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    const response = await fetch(rssUrl, {
      redirect: 'follow',
      cache: 'no-store',
      headers: REQUEST_HEADERS
    })
    if (!response.ok) {
      return { live: false, uncertain: true as const }
    }

    const xml = await response.text()
    const candidateVideoIds = extractRssVideoIds(xml, 3)
    if (candidateVideoIds.length === 0) {
      return { live: false, uncertain: true as const }
    }

    let hadUnknown = false
    for (const videoId of candidateVideoIds) {
      const isLive = await checkVideoWatchPageIsLive(videoId)
      if (isLive === null) {
        hadUnknown = true
        continue
      }
      if (isLive) {
        return { live: true, videoId }
      }
    }

    if (hadUnknown) {
      return { live: false, uncertain: true as const }
    }

    return { live: false }
  } catch {
    return { live: false, uncertain: true as const }
  }
}

const checkYoutubeLive = async (channelId: string) => {
  if (!CHANNEL_ID_REGEX.test(channelId)) {
    return { live: false, uncertain: true as const }
  }

  const liveUrl = `https://www.youtube.com/channel/${channelId}/live`
  const response = await fetch(liveUrl, {
    redirect: 'follow',
    cache: 'no-store',
    headers: REQUEST_HEADERS
  })

  const finalUrl = response.url
  const html = await response.text()
  if (isYouTubeAntiBotGate(finalUrl, response.status, html)) {
    return checkYoutubeLiveViaRssFallback(channelId)
  }

  const finalHost = (() => {
    try {
      return new URL(finalUrl).hostname
    } catch {
      return ''
    }
  })()

  if (finalHost.includes('consent.youtube.com') || isConsentInterstitial(html)) {
    return { live: false, uncertain: true as const, consentRequired: true }
  }

  const videoId = extractMainLiveVideoId(html)
  const live = hasLiveSignals(html)

  if (live && videoId) {
    return { live: true, videoId }
  }

  return { live: false }
}

const extractChannelFromUrl = (platform: Exclude<StreamPlatform, 'youtube'>, url?: string): string | null => {
  if (!url) return null
  const twitchMatch = url.match(/^https?:\/\/(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]{3,30})(?:[/?#].*)?$/i)
  if (platform === 'twitch' && twitchMatch?.[1]) return twitchMatch[1].toLowerCase()

  const kickMatch = url.match(/^https?:\/\/(?:www\.)?kick\.com\/([a-zA-Z0-9_-]{3,40})(?:[/?#].*)?$/i)
  if (platform === 'kick' && kickMatch?.[1]) return kickMatch[1].toLowerCase()

  return null
}

const checkTwitchLive = async (channel: string): Promise<boolean> => {
  const response = await fetch(`https://www.twitch.tv/${encodeURIComponent(channel)}`, {
    cache: 'no-store',
    headers: REQUEST_HEADERS,
    redirect: 'follow'
  })

  if (!response.ok) return false
  const html = await response.text()

  return (
    /"isLiveBroadcast"\s*:\s*true/.test(html) ||
    /"isLive"\s*:\s*true/.test(html) ||
    /"broadcastType"\s*:\s*"live"/.test(html)
  )
}

const checkKickLive = async (channel: string): Promise<boolean> => {
  const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`, {
    cache: 'no-store',
    headers: REQUEST_HEADERS,
    redirect: 'follow'
  })

  if (!response.ok) return false
  const data = (await response.json()) as {
    livestream?: { is_live?: boolean } | null
  }

  if (!data.livestream) return false
  if (typeof data.livestream.is_live === 'boolean') {
    return data.livestream.is_live
  }

  return true
}

const checkSource = async (source: BatchSourceInput) => {
  try {
    if (source.platform === 'youtube') {
      const channelId = source.channelId?.trim() || ''
      const result = await checkYoutubeLive(channelId)
      return {
        key: source.key,
        live: result.live,
        videoId: 'videoId' in result ? result.videoId : undefined,
        consentRequired: 'consentRequired' in result ? result.consentRequired : undefined,
        uncertain: 'uncertain' in result ? result.uncertain : undefined
      }
    }

    const platform = source.platform
    const channel =
      source.channelId?.trim().toLowerCase() || extractChannelFromUrl(platform, source.channelUrl)

    if (!channel) {
      return { key: source.key, live: false, uncertain: true }
    }

    const live = platform === 'twitch' ? await checkTwitchLive(channel) : await checkKickLive(channel)
    return { key: source.key, live }
  } catch {
    return { key: source.key, live: false, uncertain: true }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sources?: BatchSourceInput[] }
    if (!Array.isArray(body.sources)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const sources = body.sources.slice(0, 250).filter((source) => {
      if (!source || typeof source !== 'object') return false
      if (typeof source.key !== 'string' || source.key.length === 0) return false
      return source.platform === 'youtube' || source.platform === 'twitch' || source.platform === 'kick'
    })

    const results = await Promise.all(sources.map((source) => checkSource(source)))
    return NextResponse.json({ results }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
}
