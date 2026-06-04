import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

interface Props {
  content: string
}

export default function LegalPage({ content }: Props) {
  const html = marked(content) as string
  return (
    <div style={{
      maxWidth: 768, margin: '0 auto',
      padding: '32px 20px 64px',
      fontFamily: 'var(--font-golos, system-ui, sans-serif)',
    }}>
      <style>{`
        .legal-body h1 {
          font-size: 1.6rem; font-weight: 700; margin: 0 0 24px;
          color: #1a1a1f; line-height: 1.25;
        }
        .legal-body h2 {
          font-size: 1.15rem; font-weight: 700; margin: 32px 0 12px;
          color: #1a1a1f; border-bottom: 1px solid #ece5e8; padding-bottom: 6px;
        }
        .legal-body h3 {
          font-size: 1rem; font-weight: 700; margin: 24px 0 8px; color: #1a1a1f;
        }
        .legal-body p {
          margin: 0 0 14px; line-height: 1.7; color: #2e2e36; font-size: 0.9375rem;
        }
        .legal-body ul, .legal-body ol {
          margin: 0 0 14px; padding-left: 24px;
        }
        .legal-body li {
          margin-bottom: 6px; line-height: 1.6; color: #2e2e36; font-size: 0.9375rem;
        }
        .legal-body strong { color: #1a1a1f; }
        .legal-body a { color: #8B3A5A; }
        @media (max-width: 640px) {
          .legal-body h1 { font-size: 1.35rem; }
          .legal-body h2 { font-size: 1.05rem; }
        }
      `}</style>
      <div
        className="legal-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
