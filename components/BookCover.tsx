import type { Book } from '@/types'
import { imgixUrl } from '@/lib/format'

interface BookCoverProps {
  book: Book
  width?: number
  tilt?: boolean
  eager?: boolean
  className?: string
}

export default function BookCover({
  book,
  width = 800,
  tilt = true,
  eager = false,
  className = '',
}: BookCoverProps) {
  const image = book.metadata?.featured_image
  const src = image ? imgixUrl(image.imgix_url, `w=${width}&auto=format,compress`) : ''
  const height = Math.round(width * 1.5)

  return (
    <div className={`book-3d ${tilt ? 'book-3d-tilt' : ''} ${className}`}>
      <div className="book-3d-inner relative aspect-[2/3] w-full overflow-hidden bg-ink/5">
        {src ? (
          <img
            src={src}
            alt={`${book.title} — book cover`}
            width={width}
            height={height}
            loading={eager ? 'eager' : 'lazy'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-ink/20 p-6 text-center">
            <span className="font-serif text-2xl leading-tight">{book.title}</span>
          </div>
        )}
        <span className="book-spine" aria-hidden="true" />
      </div>
    </div>
  )
}