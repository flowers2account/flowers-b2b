-- Приёмник остатков из 1С: source/code_1c в staging stock_import_rows
ALTER TABLE public.stock_import_rows
  ADD COLUMN IF NOT EXISTS source  text,
  ADD COLUMN IF NOT EXISTS code_1c text;

-- быстрый поиск/супersede по источнику и коду 1С
CREATE INDEX IF NOT EXISTS stock_import_rows_source_code_1c_idx
  ON public.stock_import_rows (source, code_1c);
