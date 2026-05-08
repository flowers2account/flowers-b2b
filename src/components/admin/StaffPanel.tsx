'use client'
import { useEffect, useState } from 'react'

type StaffMember = {
  id: string
  role: string
  display_name: string | null
  phone: string | null
  email: string | null
  created_at: string | null
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
}

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export default function StaffPanel() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addPin, setAddPin] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)

  const [pinTargetId, setPinTargetId] = useState<string | null>(null)
  const [pinTargetName, setPinTargetName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSaving, setPinSaving] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/staff')
    const data = await res.json()
    setStaff(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    setAddError(null)
    if (!addName.trim()) { setAddError('Введите имя'); return }
    if (!addPhone.trim()) { setAddError('Введите телефон'); return }
    if (!/^\d{6}$/.test(addPin)) { setAddError('PIN — 6 цифр'); return }

    setAddSaving(true)
    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim(), phone: addPhone.trim(), pin: addPin }),
    })
    const data = await res.json()
    setAddSaving(false)
    if (!res.ok) { setAddError(data.error); return }

    setShowAdd(false)
    setAddName(''); setAddPhone(''); setAddPin(''); setAddError(null)
    load()
  }

  async function handleDelete(member: StaffMember) {
    if (!confirm(`Удалить сотрудника ${member.display_name ?? member.email}?`)) return
    const res = await fetch('/api/admin/staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: member.id }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    load()
  }

  async function handleChangePin() {
    setPinError(null)
    if (!/^\d{6}$/.test(newPin)) { setPinError('PIN — 6 цифр'); return }

    setPinSaving(true)
    const res = await fetch('/api/admin/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pinTargetId, pin: newPin }),
    })
    const data = await res.json()
    setPinSaving(false)
    if (!res.ok) { setPinError(data.error); return }

    setPinTargetId(null)
    setNewPin(''); setPinError(null)
  }

  const adminCount = staff.filter(s => s.role === 'admin').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">Сотрудники ({staff.length})</span>
        <button
          onClick={() => { setShowAdd(true); setAddPin(generatePin()) }}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">
          + Добавить менеджера
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-4">Загрузка...</div>
      ) : staff.length === 0 ? (
        <div className="text-sm text-gray-400 py-4">Нет сотрудников</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs text-gray-500 font-medium">
                <th className="text-left px-4 py-2">Имя</th>
                <th className="text-left px-4 py-2">Телефон</th>
                <th className="text-left px-4 py-2">Роль</th>
                <th className="text-right px-4 py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <tr key={member.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{member.display_name ?? '—'}</div>
                    <div className="text-xs text-gray-400">{member.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{member.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      member.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {ROLE_LABEL[member.role] ?? member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setPinTargetId(member.id); setPinTargetName(member.display_name ?? ''); setNewPin(generatePin()); setPinError(null) }}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                        🔑 Сменить PIN
                      </button>
                      {!(member.role === 'admin' && adminCount <= 1) && (
                        <button
                          onClick={() => handleDelete(member)}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add manager modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Новый менеджер</h2>
              <button onClick={() => { setShowAdd(false); setAddError(null) }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Имя</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="Алия Сейткали"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Телефон</label>
                <input
                  type="tel"
                  value={addPhone}
                  onChange={e => setAddPhone(e.target.value)}
                  placeholder="+77001234567"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">PIN (6 цифр)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addPin}
                    onChange={e => setAddPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="flex-1 border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    onClick={() => setAddPin(generatePin())}
                    className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200">
                    🔀
                  </button>
                </div>
              </div>
              {addError && <p className="text-xs text-red-600">{addError}</p>}
            </div>
            <div className="px-5 py-4 border-t flex gap-2 justify-end">
              <button onClick={() => { setShowAdd(false); setAddError(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
                Отмена
              </button>
              <button
                onClick={handleAdd}
                disabled={addSaving}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                {addSaving ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change PIN modal */}
      {pinTargetId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Смена PIN — {pinTargetName}</h2>
              <button onClick={() => { setPinTargetId(null); setPinError(null) }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Новый PIN (6 цифр)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="flex-1 border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    onClick={() => setNewPin(generatePin())}
                    className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200">
                    🔀
  				        </button>
                </div>
              </div>
              {pinError && <p className="text-xs text-red-600">{pinError}</p>}
            </div>
            <div className="px-5 py-4 border-t flex gap-2 justify-end">
              <button onClick={() => { setPinTargetId(null); setPinError(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
                Отмена
              </button>
              <button
                onClick={handleChangePin}
                disabled={pinSaving}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                {pinSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
