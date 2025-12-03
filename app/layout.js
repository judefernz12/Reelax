import './globals.css'
import 'video.js/dist/video-js.css'

export const metadata = {
  title: 'Reelax - Watch Together',
  description: 'Watch movies with friends in real-time',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 dark:bg-gray-900">
        {children}
      </body>
    </html>
  )
}