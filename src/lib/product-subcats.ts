// Словари подкатегорий по категориям товара — единый источник для админских форм
// (ProductEditModal, создание карточки из строки импорта).
//
// cut/pot — ручные списки. accessories выводятся из CATEGORY_TREE, чтобы витрина
// и админка не разъезжались: значение = первый member листа (каноничная запись в
// products.subcategory), подпись = «группа · лист».
import { CATEGORY_TREE, leafForSubcat } from './category-tree'

export type SubcatOption = { v: string; l: string }
export type ProductCategory = 'cut' | 'pot' | 'accessories'

export const SUBCAT_CUT = [
  { v: 'roses',          l: 'Розы'          },
  { v: 'chrysanthemums', l: 'Хризантемы'    },
  { v: 'carnations',     l: 'Гвоздики'      },
  { v: 'tulips',         l: 'Тюльпаны'      },
  { v: 'peonies',        l: 'Пионы'         },
  { v: 'ranunculus',     l: 'Ранункулюсы'   },
  { v: 'anemones',       l: 'Анемоны'       },
  { v: 'lilies',         l: 'Лилии'         },
  { v: 'gerberas',       l: 'Герберы'       },
  { v: 'lisianthus',     l: 'Эустомы'       },
  { v: 'alstroemeria',   l: 'Альстромерии'  },
  { v: 'hydrangeas',     l: 'Гортензии'     },
  { v: 'orchids',        l: 'Орхидеи'       },
  { v: 'callas',         l: 'Каллы'         },
  { v: 'anthuriums',     l: 'Антуриумы'     },
  { v: 'proteas',        l: 'Протеи'        },
  { v: 'sunflowers',     l: 'Подсолнухи'    },
  { v: 'irises',         l: 'Ирисы'         },
  { v: 'delphiniums',    l: 'Дельфиниумы'   },
  { v: 'freesia',        l: 'Фрезия'        },
  { v: 'asters',         l: 'Астры'         },
  { v: 'antirrhinum',    l: 'Антирринум'    },
  { v: 'matthiola',      l: 'Маттиола'      },
  { v: 'bouvardia',      l: 'Бувардия'      },
  { v: 'astilbe',        l: 'Астильба'      },
  { v: 'allium',         l: 'Аллиум'        },
  { v: 'celosia',        l: 'Целозия'       },
  { v: 'campanula',      l: 'Кампанула'     },
  { v: 'lathyrus',       l: 'Душистый горошек' },
  { v: 'waxflower',      l: 'Хамелауциум'   },
  { v: 'eryngium',       l: 'Эрингиум'      },
  { v: 'dahlia',         l: 'Георгин'       },
  { v: 'greens',         l: 'Зелень'        },
  { v: 'branches',       l: 'Ветки'         },
  { v: 'fillers',        l: 'Наполнители'   },
  { v: 'texture',        l: 'Текстурные'    },
  { v: 'berries',        l: 'Ягоды'         },
  { v: 'vines',          l: 'Лианы'         },
  { v: 'accents',        l: 'Акцентные'     },
  { v: 'seasonal',       l: 'Сезонные'      },
  { v: 'spring',         l: 'Весенние'      },
  { v: 'exotic',         l: 'Экзотика'      },
]
export const SUBCAT_POT = [
  // Цветущие комнатные
  { v: 'anthuriums',         l: 'Антуриум'              },
  { v: 'begonias',           l: 'Бегония'               },
  { v: 'bromeliads',         l: 'Бромелиевые'           },
  { v: 'bulbs_indoor',       l: 'Луковичные'            },
  { v: 'chrysanthemums_pot', l: 'Хризантемы горшечные'  },
  { v: 'cyclamen',           l: 'Цикламен'              },
  { v: 'hydrangeas_indoor',  l: 'Гортензия комнатная'   },
  { v: 'kalanchoe',          l: 'Каланхоэ'              },
  { v: 'orchids',            l: 'Орхидеи'               },
  { v: 'azalea_indoor',      l: 'Азалия комнатная'      },
  { v: 'roses_indoor',       l: 'Розы комнатные'        },
  { v: 'spathiphyllum',      l: 'Спатифиллум'           },
  { v: 'carnivorous',        l: 'Хищные растения'       },
  { v: 'poinsettia',         l: 'Пуансеттия'            },
  { v: 'flowering',          l: 'Цветущие прочие'       },
  // Декоративно-лиственные
  { v: 'cacti',              l: 'Кактусы'               },
  { v: 'calathea',           l: 'Калатея'               },
  { v: 'dracaena',           l: 'Драцена'               },
  { v: 'ficus',              l: 'Фикусы'                },
  { v: 'large_leaved',       l: 'Крупнолистные'         },
  { v: 'hedera',             l: 'Плющ комнатный'        },
  { v: 'palms',              l: 'Пальмы'                },
  { v: 'succulents',         l: 'Суккуленты'            },
  { v: 'polyscias',          l: 'Полисциас'             },
  { v: 'pachira',            l: 'Пахира'                },
  { v: 'yucca',              l: 'Юкка'                  },
  { v: 'ferns',              l: 'Папоротники'           },
  { v: 'zamioculcas',        l: 'Замиокулькас'          },
  { v: 'green',              l: 'Зелёные прочие'        },
  { v: 'large',              l: 'Крупномеры'            },
  // Многолетние садовые
  { v: 'helleborus',         l: 'Морозник'              },
  { v: 'lavender',           l: 'Лаванда'               },
  { v: 'ornamental_grasses', l: 'Декоративные травы'    },
  { v: 'aquatic',            l: 'Водные растения'       },
  { v: 'perennials',         l: 'Многолетние прочие'    },
  // Огородные
  { v: 'fruit_plants',       l: 'Плодовые'              },
  { v: 'vegetables',         l: 'Овощные'               },
  { v: 'herbs',              l: 'Пряные травы'          },
  // Кустарники и деревья
  { v: 'trees',              l: 'Деревья'               },
  { v: 'buxus',              l: 'Самшит'                },
  { v: 'heather',            l: 'Вереск'                },
  { v: 'conifers',           l: 'Хвойные'               },
  { v: 'gaultheria',         l: 'Гаультерия'            },
  { v: 'hedging',            l: 'Живая изгородь'        },
  { v: 'hebe',               l: 'Хебе'                  },
  { v: 'hedera_outdoor',     l: 'Плющ садовый'          },
  { v: 'hydrangeas_outdoor', l: 'Гортензия садовая'     },
  { v: 'climbing_plants',    l: 'Вьющиеся'              },
  { v: 'rhododendrons',      l: 'Рододендроны'          },
  { v: 'roses_outdoor',      l: 'Розы садовые'          },
  { v: 'skimmia',            l: 'Скиммия'               },
  { v: 'outdoor',            l: 'Кустарники прочие'     },
  // Клумбовые
  { v: 'fuchsia',            l: 'Фуксия'                },
  { v: 'geranium',           l: 'Герань'                },
  { v: 'viola',              l: 'Виола'                 },
  { v: 'patio_plants',       l: 'Растения для патио'    },
  { v: 'bedding',            l: 'Клумбовые прочие'      },
]

export const SUBCAT_ACC: SubcatOption[] = CATEGORY_TREE.flatMap(g =>
  g.leaves.map(leaf => ({ v: leaf.members[0], l: `${g.label} · ${leaf.label}` }))
)

export function subcatOptionsFor(category: ProductCategory): SubcatOption[] {
  if (category === 'pot') return SUBCAT_POT
  if (category === 'accessories') return SUBCAT_ACC
  return SUBCAT_CUT
}

/** Единица продажи по подкатегории расходки (плёнка/газон/укрывной — пог. м). */
export function unitForSubcat(subcat: string | null | undefined): string | null {
  return leafForSubcat(subcat)?.unit ?? null
}

export const CATEGORY_OPTIONS: { v: ProductCategory; l: string }[] = [
  { v: 'cut',         l: 'Срез'     },
  { v: 'pot',         l: 'Горшечные' },
  { v: 'accessories', l: 'Расходка'  },
]
