import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const preferredRegion = ['iad1']
export const dynamic = 'force-dynamic'

const REQUEST_HEADERS: HeadersInit = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9'
}

const isTwitchLive = async (channel: string): Promise<boolean> => {
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

const isKickLive = async (channel: string): Promise<boolean> => {
  const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`, {
    cache: 'no-store',
    headers: REQUEST_HEADERS,
    redirect: 'follow'
  })

  if (!response.ok) return false
  const data = (await response.json()) as {
    livestream?: { is_live?: boolean } | null
    previous_livestreams?: unknown[]
  }

  if (!data.livestream) return false
  if (typeof data.livestream.is_live === 'boolean') {
    return data.livestream.is_live
  }

  return true
}

export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get('platform')?.trim().toLowerCase()
  const channel = request.nextUrl.searchParams.get('channel')?.trim()

  if (!channel) {
    return NextResponse.json({ error: 'Missing channel parameter' }, { status: 400 })
  }

  if (platform !== 'twitch' && platform !== 'kick') {
    return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
  }

  try {
    const live =
      platform === 'twitch' ? await isTwitchLive(channel) : await isKickLive(channel)

    return NextResponse.json({ live, platform, channel }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { live: false, uncertain: true, platform, channel, error: message },
      { status: 200 }
    )
  }
}
