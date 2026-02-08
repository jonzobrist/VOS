import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VOS - Document Review',
  description: 'Voxora · Opinari · Scrutara — AI-powered multi-persona document review',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0f] text-[#e4e4ec] antialiased">{children}</body>
    </html>
  )
}
