export interface Livestream {
  id: string
  channelUrl: string
  channelId?: string
  title: string
  videoId?: string
  consentRequired?: boolean
  priority?: number
  widthPercent?: number
  heightPercent?: number
  row?: number
}
