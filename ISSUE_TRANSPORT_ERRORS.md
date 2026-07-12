# Issue: Transport error handling + temp key reconnect

## Статус: ИСПРАВЛЕНО

Все описанные проблемы решены в коммитах `4d1d3c0` — `a0d20c1`.

---

## Проблема 1: Temp key expires → infinite 404 loop

**Решено:** `_handleBadAuthKey` теперь отклоняет pending запросы с `RPCError('TIMEOUT')`, что позволяет MediaScheduler создать новый слот с новым temp key.

---

## Проблема 2: Codecs + transport errors

**Решено:**
- DD codec правильно определяется по secret prefix (`\xdd` → `DDPacketCodec`)
- Transport errors обрабатываются: 404 → kill slot, 429 → FloodWait, 444/unknown → reconnect
- Server quick ACK обнаруживается в DD (8-16 байт с `0xFFFFFFFF`)

---

## Проблема 3: Siblings с мёртвым temp key

**Решено:** `_onSenderBreak` помечает все siblings на том же DC как мёртвые при `resetMediaTempKey()`.

---

## Проблема 4: SecurityError от corrupted siblings

**Решено:** SecurityError с "auth key" теперь terminal → `_handleBadAuthKey()`.

---

## См. также

- `TELEPROTO_FIX_SUMMARY.md` — полный отчёт
- `FIXES_SUMMARY.md` — краткая сводка
- Issue #23 в sanyok12345/teleproto — описание проблемы и фиксов
