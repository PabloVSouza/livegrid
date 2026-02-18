import type { Metadata, Viewport } from 'next'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './globals.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryProvider } from '@/components/QueryProvider'

export const metadata: Metadata = {
  title: 'LiveGrid by Pablo Souza',
  description: 'Watch and monitor multiple YouTube livestream channels in one grid',
  metadataBase: new URL('https://livegrid.pablosouza.dev'),
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
    <html lang="en">
      <body>
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
