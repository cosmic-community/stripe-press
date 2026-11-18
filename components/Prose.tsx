import { marked } from 'marked'

interface ProseProps {
  content: string
  dropCap?: boolean
  className?: string
}

export default function Prose({ content, dropCap = false, className = '' }: ProseProps) {
  const source = content.trim()

  if (!source) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted">
        [ No content yet ]
      </p>
    )
  }

  // marked passes through any raw HTML, so both markdown and HTML rich-text render.
  const html = marked.parse(source, { async: false, gfm: true }) as string

  return (
    <div
      className={`longform ${dropCap ? 'longform-dropcap' : ''} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}