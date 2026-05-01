export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        header { display: none !important; }
        body { background: white; }
        @media print { .no-print { display: none !important; } }
      `}</style>
      {children}
    </>
  )
}
