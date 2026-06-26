# ⚠️ УСТАРЕЛО (на 2026-06-26)

> Этот документ описывал обновление триггера `confirm_order_fifo` для синхронизации `stock.qty_reserved`.  
> **Таблиц `stock`/`batches` больше нет** (rebuild ~25.05.2026), колонки `qty_reserved` тоже.  
> Резерв теперь вычисляется на лету во view `stock_available` из активных `reservations` — синхронизировать нечего.
>
> **Актуально:** [`docs/STOCK_MANAGEMENT.md`](./docs/STOCK_MANAGEMENT.md), [`docs/STOCK_QUICK_REF.md`](./docs/STOCK_QUICK_REF.md), [`DOCS_AUDIT_REPORT.md`](./DOCS_AUDIT_REPORT.md).

---

## Что есть по факту

`confirm_order_fifo(p_order_id)` (вызывается триггером `trg_order_confirm` при переходе заказа в `confirmed`) делает **простое списание остатка** — без FIFO, без партий, без `qty_reserved`:

```sql
FOR item IN SELECT product_id, qty, price FROM order_items WHERE order_id = p_order_id LOOP
  UPDATE products SET qty = GREATEST(0, qty - item.qty) WHERE id = item.product_id;
  INSERT INTO inventory_ledger (...) VALUES (..., 'sale', ...);
END LOOP;
DELETE FROM reservations WHERE order_id = p_order_id;
```

Ниже — исторический текст (не применять).

---

<details>
<summary>Архив исходного документа</summary>

Документ предлагал `UPDATE stock SET qty_reserved = GREATEST(0, qty_reserved - ordered)` и триггер на DELETE `reservations`. Это относилось к удалённой 3-уровневой схеме `products → stock → batches` и больше неприменимо.

</details>
</content>
