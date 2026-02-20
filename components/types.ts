export type StreamPlatform = 'youtube' | 'twitch' | 'kick'

export interface LivestreamSource {
  sourceId: string
  platform: StreamPlatform
  channelUrl: string
  channelId?: string
  videoId?: string
  consentRequired?: boolean
  isLive?: boolean
  avatarUrl?: string
}

export interface Livestream {
  id: string
  title: string
  channelUrl: string
  platform?: StreamPlatform
  channelId?: string
  videoId?: string
  consentRequired?: boolean
  isLive?: boolean
  activeSourceId?: string
  sources?: LivestreamSource[]
  priority?: number
  widthPercent?: number
  heightPercent?: number
  row?: number
}
