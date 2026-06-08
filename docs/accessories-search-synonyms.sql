-- ============================================================
-- Синонимы поиска для accessories (применено 2026-06-08)
-- Применено как Supabase-миграция: accessories_search_synonyms
-- ============================================================
-- term  = канон-slug подкатегории (совпадает с members в src/lib/category-tree.ts)
--         → expand_search_query() возвращает slug → /api/products матчит subcategory.eq.<slug>
-- category = 'accessories' (метка + идемпотентность; цветочные строки не трогаем)
--
-- Идемпотентно: DELETE своих строк + INSERT. UNIQUE-индекс/ON CONFLICT не нужны.
-- Откат: DELETE FROM search_synonyms WHERE category='accessories';
-- ============================================================

DELETE FROM search_synonyms WHERE category='accessories';

INSERT INTO search_synonyms (term, synonyms, category) VALUES
 ('soil',             ARRAY['грунт','земля','почва','субстрат','торф','торфяной','soil'], 'accessories'),
 ('fertilizers',      ARRAY['удобрение','подкормка','удо','комплексное удобрение','fertilizer','нпк'], 'accessories'),
 ('growth_stim',      ARRAY['стимулятор','стимулятор роста','эпин','циркон','корневин'], 'accessories'),
 ('film',             ARRAY['плёнка','пленка','полиэтилен','пэ','film'], 'accessories'),
 ('film_bags',        ARRAY['пакеты','пакет','мешки','пакеты п/э','bags'], 'accessories'),
 ('cover_film',       ARRAY['укрывная плёнка','тепличная плёнка','чёрная плёнка'], 'accessories'),
 ('paper',            ARRAY['бумага','крафт','крафт-бумага','упаковочная бумага','тишью','paper'], 'accessories'),
 ('pots',             ARRAY['горшок','горшки','ёмкость','контейнер','pot'], 'accessories'),
 ('kashpo',           ARRAY['кашпо','kashpo'], 'accessories'),
 ('vases',            ARRAY['ваза','вазочка','вазы','vase'], 'accessories'),
 ('baskets',          ARRAY['корзина','корзинка','плетёная корзина','basket'], 'accessories'),
 ('dried',            ARRAY['сухоцветы','сушёные цветы','сухоцвет','dried'], 'accessories'),
 ('artificial',       ARRAY['искусственные цветы','искусственные растения','пластиковые цветы','artificial'], 'accessories'),
 ('decor',            ARRAY['декор','украшение','сувенир','декоративный'], 'accessories'),
 ('plant_protection', ARRAY['фунгицид','инсектицид','гербицид','от тли','от грибка','от сорняков','защита растений'], 'accessories'),
 ('floral_foam',      ARRAY['флористическая пена','флор пена','оазис','floral foam'], 'accessories'),
 ('fillers',          ARRAY['наполнитель','наполнитель букета','filler'], 'accessories'),
 ('artificial_grass', ARRAY['искусственный газон','газон','трава искусственная','grass'], 'accessories'),
 ('cover_fabric',     ARRAY['укрывной материал','спанбонд','агроткань'], 'accessories'),
 ('tools',            ARRAY['инструмент','секатор','ножницы','tool'], 'accessories');
