import type { Metadata } from "next"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"

export const metadata: Metadata = {
  title: "LiveGrid by Pablo Souza",
  description: "Watch and monitor multiple YouTube livestream channels in one grid",
  metadataBase: new URL("https://livegrid.pablosouza.dev")
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
