import './globals.css'
import 'video.js/dist/video-js.css'

export const metadata = {
  title: 'Reelax - Watch Together',
  description: 'Watch movies with friends in real-time',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Video.js CSS */}
        <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet" />
      </head>
      <body className="bg-gray-50 dark:bg-gray-900">
        {children}
      </body>
    </html>
  )
}