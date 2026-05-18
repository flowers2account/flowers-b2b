'use client';

import { useState } from 'react';
import { parseInvoiceFile } from '@/lib/naming/parse-invoice';
import type { ParsedInvoice } from '@/lib/naming/types';

export default function TranslationsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParsedInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const parsed = await parseInvoiceFile(file);
      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обработки файла');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = () => {
    if (!result) return;

    const text = result.translations
      .map(t => `${t.original}\t${t.translated}`)
      .join('\n');

    navigator.clipboard.writeText(text);
    alert('Скопировано в буфер обмена!');
  };

  const handleExport = () => {
    if (!result) return;

    const csv = [
      'Оригинал,Перевод,Confidence,MatchedBy,Категория',
      ...result.translations.map(t =>
        `"${t.original}","${t.translated}",${t.confidence},${t.matchedBy},${t.category || ''}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `translations_${result.fileName.replace(/\.[^.]+$/, '')}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🔤 Извлечение переводов для 1С</h1>
        <p className="text-gray-600">
          Загрузите накладную (Invoice*.xls или sp Factuur*.xlsx) для извлечения нормализованных переводов
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            📄 Загрузите накладную
          </label>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2"
          />
        </div>

        <button
          onClick={handleProcess}
          disabled={!file || loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? '⏳ Обработка...' : '🚀 Обработать'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            ❌ {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">
                  📊 Результат ({result.totalItems} товаров)
                </h2>
                <p className="text-sm text-gray-600">
                  Тип: {result.type === 'astrafund' ? 'Astrafund' : 'Horti Fair'} •{' '}
                  Файл: {result.fileName}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyAll}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                >
                  📋 Скопировать всё
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                >
                  📊 Экспорт в CSV
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">№</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Оригинал</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Перевод</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Метод</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Категория</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.translations.map((t, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-mono">{t.original}</td>
                    <td className="px-4 py-3 text-sm font-medium">{t.translated}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        t.confidence >= 0.95 ? 'bg-green-100 text-green-800' :
                        t.confidence >= 0.85 ? 'bg-blue-100 text-blue-800' :
                        t.confidence >= 0.7  ? 'bg-yellow-100 text-yellow-800' :
                                               'bg-red-100 text-red-800'
                      }`}>
                        {(t.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{t.matchedBy}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex px-2 py-1 rounded text-xs bg-gray-100">
                        {t.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
