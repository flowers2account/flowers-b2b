'use client'

import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'

type ClientRecord = {
  id: string
  name: string | null
  company_name: string | null
  phone: string | null
  pin: string | null
  status: 'active' | 'inactive' | 'blocked'
  created_at: string
  auth_user_id: string | null
}

type ImportResult = { created: number; skipped: number; errors: string[] } | null

function AddClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function genPin() {
    setPin(Math.floor(100000 + Math.random() * 900000).toString())
    setShowPin(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone || !pin) { setError('Телефон и PIN обязательны'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name, company_name: company, pin }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); setLoading(false); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-base font-semibold mb-4">Новый клиент</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Телефон *</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+77001234567"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Имя</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Иван Иванов"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Компания</label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="ООО Ромашка"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PIN *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  type={showPin ? 'text' : 'password'}
                  placeholder="6 цифр"
                  maxLength={6}
                  className="w-full border rounded px-3 py-2 text-sm font-mono pr-8"
                  required
                />
                {pin && (
                  <button
                    type="button"
                    onClick={() => setShowPin(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    {showPin ? '🙈' : '👁'}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={genPin}
                className="px-3 py-2 text-xs bg-gray-100 border rounded hover:bg-gray-200 whitespace-nowrap"
              >
                Сгенерировать
              </button>
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditClientModal({ client, onClose, onSaved }: { client: ClientRecord; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(client.name ?? '')
  const [company, setCompany] = useState(client.company_name ?? '')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function genPin() {
    setPin(Math.floor(100000 + Math.random() * 900000).toString())
    setShowPin(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pin && !/^\d{4,6}$/.test(pin)) { setError('PIN должен быть от 4 до 6 цифр'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, name, company_name: company, ...(pin && { pin }) }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); setLoading(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-base font-semibold mb-1">Редактировать клиента</h2>
        <p className="text-xs text-gray-500 mb-4">{client.phone}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Имя</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Компания</label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Новый PIN <span className="text-gray-400">(оставьте пустым чтобы не менять)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  type={showPin ? 'text' : 'password'}
                  placeholder="••••••"
                  maxLength={6}
                  className="w-full border rounded px-3 py-2 text-sm font-mono pr-8"
                />
                {pin && (
                  <button
                    type="button"
                    onClick={() => setShowPin(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    {showPin ? '🙈' : '👁'}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={genPin}
                className="px-3 py-2 text-xs bg-gray-100 border rounded hover:bg-gray-200 whitespace-nowrap"
              >
                Сгенерировать
              </button>
            </div>
            {client.pin && !pin && (
              <p className="text-xs text-gray-400 mt-1">Текущий PIN: {client.pin}</p>
            )}
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const statusLabel: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  blocked: 'Заблокирован',
}

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  blocked: 'bg-red-100 text-red-700',
}

export default function ClientsPanel() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editClient, setEditClient] = useState<ClientRecord | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult>(null)
  const [visiblePins, setVisiblePins] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/clients')
    const data = await res.json()
    setClients(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company_name?.toLowerCase().includes(q)
    )
  })

  function togglePin(id: string) {
    setVisiblePins(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/clients/import', { method: 'POST', body: formData })
    const result = await res.json()
    setImportResult(result)
    setImporting(false)
    load()
    if (fileRef.current) fileRef.current.value = ''
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Телефон', 'Имя', 'Компания', 'PIN'],
      ['+77001234567', 'Иван Иванов', 'ООО Ромашка', '123456'],
    ])
    ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Клиенты')
    XLSX.writeFile(wb, 'clients_template.xlsx')
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-600">Клиенты ({clients.length})</span>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={downloadTemplate}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            📄 Шаблон
          </button>
          <label className={`px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? 'Импорт...' : '📥 Импорт Excel'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            + Добавить клиента
          </button>
        </div>
      </div>

      {importResult && (
        <div className="rounded p-3 bg-gray-50 border text-sm space-y-1">
          <div className="text-green-700 font-medium">✅ Создано: {importResult.created}</div>
          {importResult.skipped > 0 && (
            <div className="text-yellow-700">⏭ Пропущено: {importResult.skipped}</div>
          )}
          {importResult.errors.length > 0 && (
            <div className="text-red-700">
              ❌ Ошибок: {importResult.errors.length}
              <ul className="mt-1 list-disc list-inside text-xs text-red-600 max-h-32 overflow-y-auto">
                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <input
        type="text"
        placeholder="Поиск по имени, телефону, компании..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-4">Клиентов нет</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-400">
                <th className="text-left py-2 pr-4">Имя / Компания</th>
                <th className="text-left py-2 pr-4">Телефон</th>
                <th className="text-left py-2 pr-4">PIN</th>
                <th className="text-left py-2 pr-4">Статус</th>
                <th className="text-right py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{c.name ?? '—'}</div>
                    {c.company_name && (
                      <div className="text-xs text-gray-500">{c.company_name}</div>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{c.phone ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => togglePin(c.id)}
                      title="Нажмите чтобы показать/скрыть"
                      className="font-mono text-xs text-gray-600 hover:text-gray-900 tracking-widest"
                    >
                      {visiblePins.has(c.id) ? (c.pin ?? '—') : '••••'}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setEditClient(c)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                    >
                      ✏️ Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load() }}
        />
      )}

      {editClient && (
        <EditClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onSaved={() => { setEditClient(null); load() }}
        />
      )}
    </div>
  )
}
