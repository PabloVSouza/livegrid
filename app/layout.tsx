import type { Metadata, Viewport } from 'next'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './globals.css'
import { QueryProvider } from '@components/QueryProvider'
import { TooltipProvider } from '@ui/tooltip'

export const metadata: Metadata = {
  title: 'LiveGrid by Pablo Souza',
  description:
    'Monitor and watch multiple livestreams in one grid (YouTube, Twitch, Kick). Monitore várias lives em um único grid.',
  metadataBase: new URL('https://livegrid.pablosouza.dev'),
  openGraph: {
    title: 'LiveGrid by Pablo Souza',
    description:
      'Monitor and watch multiple livestreams in one grid (YouTube, Twitch, Kick). Monitore várias lives em um único grid.',
    url: 'https://livegrid.pablosouza.dev',
    siteName: 'LiveGrid',
    locale: 'pt_BR',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LiveGrid by Pablo Souza',
    description:
      'Monitor and watch multiple livestreams in one grid (YouTube, Twitch, Kick). Monitore várias lives em um único grid.'
  },
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '256x256', type: 'image/x-icon' }],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/favicon.ico' }]
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
