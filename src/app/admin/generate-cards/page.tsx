'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/client';
import { generateProductCard } from '@/lib/card-generator';
import { COUNTRY_LABELS } from '@/lib/countries';

interface Product {
  id: number;
  name: string;
  display_name: string | null;
  image_url: string | null;
  campaign_image_url: string | null;
  category: string;
  country_iso: string | null;
  colors: string[] | null;
  pack_size: number;
  stems_per_pack: number | null;
  length_cm: number | null;
  price: number;
  qty: number;
}

interface GeneratedCard {
  blob: Blob;
  url: string;
  name: string;
}


function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 50);
}

export default function GenerateCardsPage() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const [downloading, setDownloading] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[] | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [catAcc, setCatAcc] = useState(true);  // расходники включены (активный склад)
  const [catCut, setCatCut] = useState(false); // срезка выключена по умолчанию
  const [catPot, setCatPot] = useState(false); // горшки выключены
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [minStock, setMinStock] = useState(5);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('products')
        .select('id, name, display_name, image_url, campaign_image_url, category, country_iso, colors, pack_size, stems_per_pack, length_cm, price, qty')
        .eq('is_active', true)
        .gt('qty', 0)
        .order('category')
        .order('name');

      if (error) { console.error(error); setLoading(false); return; }

      setAllProducts(((data ?? []) as Product[]).filter(p => p.image_url));
      setLoading(false);
    }
    load();
  }, []);

  const countries = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach(p => { if (p.country_iso) set.add(p.country_iso); });
    return Array.from(set).sort();
  }, [allProducts]);

  const filtered = useMemo(() => {
    return allProducts.filter(p => {
      if (!catCut && p.category === 'cut') return false;
      if (!catPot && p.category === 'pot') return false;
      if (!catAcc && p.category === 'accessories') return false;
      if (countryFilter !== 'all' && p.country_iso !== countryFilter) return false;
      if (p.qty < minStock) return false;
      return true;
    });
  }, [allProducts, catCut, catPot, catAcc, countryFilter, minStock]);

  useEffect(() => {
    setSelectedIds(prev => {
      const filteredIds = new Set(filtered.map(p => p.id));
      const next = new Set<number>();
      prev.forEach(id => { if (filteredIds.has(id)) next.add(id); });
      return next;
    });
  }, [filtered]);

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(filtered.map(p => p.id))); }
  function deselectAll() { setSelectedIds(new Set()); }

  const handleGenerate = async () => {
    const toGenerate = filtered.filter(p => selectedIds.has(p.id));
    if (toGenerate.length === 0) return;

    setGenerating(true);
    setProgress(0);
    setProgressTotal(toGenerate.length);
    setGeneratedCards(null);

    const cards: GeneratedCard[] = [];

    for (let i = 0; i < toGenerate.length; i++) {
      const p = toGenerate[i];
      if (p.image_url) {
        try {
          const blob = await generateProductCard({
            id: p.id,
            name: p.display_name || p.name,
            length_cm: p.length_cm,
            price: p.price,
            country_iso: p.country_iso,
            colors: p.colors,
            availableQty: p.qty,
            packSize: p.pack_size,
            stemsPerPack: p.stems_per_pack,
            imageUrl: p.campaign_image_url || p.image_url,
          });
          cards.push({ blob, url: URL.createObjectURL(blob), name: p.display_name || p.name });
        } catch (err) {
          console.error(`Card error for ${p.name}:`, err);
        }
      }
      setProgress(i + 1);
    }

    setGenerating(false);
    setGeneratedCards(cards);
  };

  const handleDownloadAll = async () => {
    if (!generatedCards || generatedCards.length === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      generatedCards.forEach((card, i) => {
        zip.file(`${String(i + 1).padStart(3, '0')}_${sanitizeFilename(card.name)}.jpg`, card.blob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cards_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP error:', err);
      alert('Ошибка при создании архива');
    } finally {
      setDownloading(false);
    }
  };

  const totalBytes = generatedCards?.reduce((s, c) => s + c.blob.size, 0) ?? 0;
  const genTotal = progressTotal || filtered.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-3" style={{ borderColor: '#7a1c2e' }} />
          <p className="text-gray-500 text-sm">Загрузка товаров...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Генерация карточек</h1>
            <p className="text-sm text-gray-500 mt-0.5">Карточки товаров для WhatsApp / Telegram</p>
          </div>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors">
            ← В админку
          </Link>
        </div>

        {/* Фильтры */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Фильтры</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Категория</p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={catAcc} onChange={e => setCatAcc(e.target.checked)} className="rounded" style={{ accentColor: '#7a1c2e' }} />
                  <span className="text-sm">📦 Расходники</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={catCut} onChange={e => setCatCut(e.target.checked)} className="rounded" style={{ accentColor: '#7a1c2e' }} />
                  <span className="text-sm">✂️ Срез</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={catPot} onChange={e => setCatPot(e.target.checked)} className="rounded" style={{ accentColor: '#7a1c2e' }} />
                  <span className="text-sm">🪴 Горшок</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Страна</label>
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]">
                <option value="all">Все</option>
                {countries.map(iso => (
                  <option key={iso} value={iso}>{COUNTRY_LABELS[iso] ?? iso}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Мин. остаток, шт</label>
              <input type="number" min={0} value={minStock} onChange={e => setMinStock(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7a1c2e]/30 focus:border-[#7a1c2e]" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Найдено: <span className="font-semibold" style={{ color: '#7a1c2e' }}>{filtered.length}</span> из {allProducts.length}
            </p>
          </div>
        </div>

        {/* Выбор товаров */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Выбор товаров</h2>
            {filtered.length > 0 && (
              <div className="flex items-center gap-3">
                <button onClick={selectAll} className="text-xs font-medium hover:underline" style={{ color: '#7a1c2e' }}>
                  Выбрать все
                </button>
                <span className="text-gray-300">|</span>
                <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">Снять выбор</button>
                <span className="text-xs text-gray-600">
                  Выбрано: <span className="font-semibold" style={{ color: '#7a1c2e' }}>{selectedIds.size}</span> из {filtered.length}
                </span>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">Нет товаров по заданным фильтрам</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-96 overflow-y-auto pr-1">
              {filtered.map(p => {
                const selected = selectedIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    className="border rounded-lg overflow-hidden cursor-pointer transition-all relative"
                    style={selected ? { outline: '2px solid #7a1c2e', outlineOffset: 1 } : { borderColor: '#f3f4f6' }}
                  >
                    <div className="absolute top-1 left-1 z-10">
                      <input
                        type="checkbox"
                        readOnly
                        checked={selected}
                        className="w-3.5 h-3.5 rounded pointer-events-none"
                        style={{ accentColor: '#7a1c2e' }}
                      />
                    </div>
                    <div className="aspect-square bg-gray-50 overflow-hidden">
                      <img src={p.image_url!} alt={p.display_name || p.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="text-[10px] font-medium text-gray-700 truncate leading-tight">{p.display_name || p.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {p.price.toLocaleString('ru-RU')} ₸
                        {p.length_cm ? ` · ${p.length_cm} см` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Кнопка генерации + прогресс */}
        <div className="space-y-3">
          <button
            onClick={handleGenerate}
            disabled={selectedIds.size === 0 || generating}
            className="w-full flex items-center justify-center gap-2 py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: '#7a1c2e' }}
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span>Генерация {progress} / {progressTotal}...</span>
              </>
            ) : (
              <>
                <span>🎨</span>
                <span>
                  {selectedIds.size === 0
                    ? 'Выберите товары для генерации'
                    : `Сгенерировать карточки (${selectedIds.size})`}
                </span>
              </>
            )}
          </button>

          {generating && progressTotal > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Обработка изображений...</span>
                <span>{Math.round((progress / progressTotal) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(progress / progressTotal) * 100}%`, backgroundColor: '#7a1c2e' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Результаты */}
        {generatedCards && generatedCards.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Карточек создано', value: generatedCards.length, color: '#7a1c2e' },
                { label: 'Общий размер', value: `${Math.round(totalBytes / 1024)} КБ`, color: '#3D6B50' },
                { label: 'Средний размер', value: `${Math.round(totalBytes / generatedCards.length / 1024)} КБ`, color: '#2563eb' },
                { label: 'Разрешение', value: '600×850', color: '#7c3aed' },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Готово: {generatedCards.length} карточек
                </h2>
                <button onClick={handleDownloadAll} disabled={downloading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#3D6B50' }}>
                  {downloading ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /><span>Создание архива...</span></>
                  ) : <>📦 Скачать ZIP ({generatedCards.length})</>}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {generatedCards.map((card, i) => (
                  <div key={card.url} className="group relative">
                    <img src={card.url} alt={card.name} className="w-full rounded-lg border border-gray-100 shadow-sm" />
                    <a href={card.url} download={`${String(i + 1).padStart(3, '0')}_${sanitizeFilename(card.name)}.jpg`}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <span className="text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded">⬇ Скачать</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Link href="/admin" className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-white transition-colors inline-flex items-center gap-2">
                ← Вернуться в админку
              </Link>
              <button onClick={() => { setGeneratedCards(null); setProgress(0); setProgressTotal(0); }}
                className="px-5 py-2.5 border rounded-xl text-sm font-medium transition-colors"
                style={{ borderColor: '#7a1c2e', color: '#7a1c2e' }}>
                🔄 Сгенерировать заново
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
