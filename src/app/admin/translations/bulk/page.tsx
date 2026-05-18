'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { normalizeText } from '@/lib/utils/normalize-text';

interface TranslationResult {
  original: string;
  translated: string;
  confidence: number;
  method: 'db_exact' | 'ai_assisted' | 'rule_based';
  source?: string;
  editable: boolean;
}

export default function BulkTranslationPage() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<TranslationResult[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleTranslate = async () => {
    if (!input.trim()) return;

    setLoading(true);
    try {
      const products = input
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

      if (products.length === 0) {
        alert('Вставьте названия товаров');
        return;
      }

      const response = await fetch('/api/translations/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });

      if (!response.ok) throw new Error('API error');

      const data = await response.json();
      setResults(data.results);
      setStats(data.stats);

    } catch (error) {
      console.error(error);
      alert('Ошибка при выполнении перевода');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (index: number, newTranslation: string) => {
    setResults(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        translated: newTranslation,
        method: 'rule_based',
        source: 'manual'
      };
      return updated;
    });
  };

  const handleApprove = async () => {
    if (results.length === 0) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert('Необходима авторизация администратора');
        return;
      }

      const records = results.map(r => ({
        original: r.original,
        normalized_original: normalizeText(r.original),
        translated: r.translated,
        confidence: r.confidence,
        source: r.source || r.method,
        approved_by: user.id,
        category: null
      }));

      const { error } = await supabase
        .from('translation_memory')
        .upsert(records, {
          onConflict: 'normalized_original',
          ignoreDuplicates: false
        });

      if (error) throw error;

      alert(`✅ Успешно сохранено и одобрено позиций: ${records.length}`);

      setInput('');
      setResults([]);
      setStats(null);

    } catch (error) {
      console.error(error);
      alert('Ошибка при сохранении данных в БД');
    } finally {
      setSaving(false);
    }
  };

  const getMethodBadge = (method: string) => {
    const styles = {
      db_exact: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium',
      ai_assisted: 'bg-purple-50 text-purple-700 border-purple-200 font-medium',
      rule_based: 'bg-sky-50 text-sky-700 border-sky-200 font-medium'
    };
    const labels = {
      db_exact: '📥 Точная БД',
      ai_assisted: '✨ Gemini ИИ',
      rule_based: '⚙️ Правило'
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs rounded-full border ${styles[method as keyof typeof styles]}`}>
        {labels[method as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl min-h-screen bg-white text-slate-900 selection:bg-blue-100">

      {/* Шапка страницы */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Массовый перевод номенклатуры</h1>
          <p className="text-sm text-slate-500 mt-1">
            Инструмент полуавтоматического перевода позиций через базу знаний и ИИ контекст.
          </p>
        </div>
      </div>

      {/* Инпут секция */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/60 mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Вставьте список оригинальных названий (одна позиция в строке):
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full h-44 p-3 border border-slate-300 rounded-lg font-mono text-sm shadow-inner bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-slate-100 disabled:text-slate-400"
          placeholder={"Clusia rosea 'Princess'\nDracaena fr de 'Warneckei'\nPhalaenopsis ...mix 4"}
          disabled={loading}
        />
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-3">
            <button
              onClick={handleTranslate}
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Обработка батча...
                </>
              ) : '🚀 Запустить перевод'}
            </button>
            {results.length > 0 && (
              <button
                onClick={() => {
                  setInput('');
                  setResults([]);
                  setStats(null);
                }}
                className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium shadow-sm transition-colors"
              >
                Очистить экран
              </button>
            )}
          </div>

          {loading && (
            <span className="text-xs text-slate-500 animate-pulse font-mono">
              Поиск точных совпадений ➔ Сверка с правилами ➔ Запрос к Gemini API
            </span>
          )}
        </div>
      </div>

      {/* Статистика */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-sm">
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Всего в пакете</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{stats.total} шт.</div>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Из базы (Exact)</div>
            <div className="text-xl font-bold text-emerald-600 mt-0.5">{stats.db_exact} шт.</div>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Нейросеть (Gemini)</div>
            <div className="text-xl font-bold text-purple-600 mt-0.5">{stats.ai_assisted} шт.</div>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">По жестким правилам</div>
            <div className="text-xl font-bold text-sky-600 mt-0.5">{stats.rule_based} шт.</div>
          </div>
        </div>
      )}

      {/* Таблица результатов */}
      {results.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Оригинальное имя (Поставщик)</th>
                  <th className="py-3 px-4">Корректный русский перевод (Редактируемый)</th>
                  <th className="py-3 px-4 w-28 text-center">Уверенность</th>
                  <th className="py-3 px-4 w-36 text-center">Источник</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-mono text-xs text-slate-400 bg-slate-50/40">
                      {i + 1}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 max-w-xs break-words">
                      {r.original}
                    </td>
                    <td className="py-2 px-4">
                      <input
                        type="text"
                        value={r.translated}
                        onChange={(e) => handleEdit(i, e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-md shadow-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-slate-300 transition-colors"
                      />
                    </td>
                    <td className="py-3 px-4 text-center font-semibold">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                        r.confidence >= 0.9 ? 'bg-emerald-50 text-emerald-700' :
                        r.confidence >= 0.7 ? 'bg-amber-50 text-amber-700' :
                        'bg-rose-50 text-rose-700'
                      }`}>
                        {Math.round(r.confidence * 100)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {getMethodBadge(r.method)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Панель действий */}
          <div className="bg-slate-50 px-4 py-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <p className="text-xs text-slate-500">
              💡 Внимательно просмотрите строки перед одобрением. Все одобренные переводы попадут в общую память системы.
            </p>
            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => {
                  const csv = [
                    'Original,Translated,Confidence,Method',
                    ...results.map(r => `"${r.original}","${r.translated}",${r.confidence},${r.method}`)
                  ].join('\n');
                  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `translations_batch_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                }}
                className="inline-flex items-center px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium shadow-sm transition-colors text-xs"
              >
                📥 Скачать .CSV
              </button>
              <button
                onClick={handleApprove}
                disabled={saving}
                className="inline-flex items-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed text-xs"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Сохранение...
                  </>
                ) : '✅ Полностью одобрить и занести в базу'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
