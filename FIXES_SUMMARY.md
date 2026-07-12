# Teleproto — Итого по исправлениям

## Статус: Готово к тестированию

Последний коммит: `a0d20c1`

---

## Что исправлено

### 1. Issue #23 — Media download deadlock

| Fix | Файл | Описание |
|-----|------|----------|
| `_handleBadAuthKey` | `MTProtoSender.ts` | Reject pending с TIMEOUT + `userDisconnected = true` |
| `_onSenderBreak` | `Network.ts` | Kill siblings на том же DC при `resetMediaTempKey()` |
| SecurityError "auth key" | `MTProtoSender.ts` | Terminal error → `_handleBadAuthKey()` |
| MediaScheduler retry | `MediaScheduler.ts` | `TIMEOUT` в retry list |
| Transport errors | `MTProtoSender.ts` | 404 → kill slot, 429 → FloodWait, 444/unknown → reconnect |

### 2. DD Codec

| Файл | Описание |
|------|----------|
| `TCPDCSecret.ts` | `ConnectionTCPDDSecret` → `DDPacketCodec` (был `AbridgedPacketCodec`) |
| `PaddedIntermediate.ts` | Server quick ACK detection (8-16 bytes с `0xFFFFFFFF`) |
| `PaddedIntermediate.ts` | Override `checkTransportError` только для 404/429/444 |

### 3. Config refresh

| Файл | Описание |
|------|----------|
| `TelegramClient.ts` | Метод `_refreshConfig()` |
| `updates.ts` | Обработчик `updateConfig` + periodic refresh каждые 60 мин |

### 4. Прочее

| Файл | Описание |
|------|----------|
| `Connection.ts` | INFO лог при выборе кодека |
| `updates.ts` | Закомментирован debug лог пинга |

---

## Коммиты

```
a0d20c1 fix: correct order of transport error handling
33ee7a6 fix: use TIMEOUT error for auth key rejection to leverage existing retry logic
9740149 fix: retry on AUTH_KEY_INVALID error in MediaScheduler
ae30e96 fix: conservative transport error handling
abdfeba fix: remove redundant reconnect() on 404
344830b fix: use RPCError instead of generic Error for auth key rejection
f677040 fix: log errors when marking slots as dead
617ec90 refactor: use 'auth-broken' for all auth key failure death reasons
0837c81 fix: resolve media download deadlock on temp auth key failure (issue #23)
cd1ef49 fix: remove DC migration on 444, reconnect to same DC like Nicegram
8a772fc refactor: remove redundant 444 handling
9749b23 feat: add config refresh mechanism
84b3f0a fix: complete transport codec fixes
dff89d1 fix: DD codec overrides checkTransportError for known error codes only
2974ae1 fix: detect DD server quick ACK + revert base checkTransportError
6d71642 fix: only detect known transport error codes (404, 429, 444)
4d1d3c0 fix: use DDPacketCodec for ConnectionTCPDDSecret + add codec INFO log
```

---

## Если что-то пойдёт не так

Откатиться до стабильного состояния:
```bash
git checkout 4d1d3c0
```

Этот коммит содержит базовые исправления (DD codec + transport errors) без additional fixes для issue #23.

---

## Что тестировать

1. Скачивание файлов — проверить что 404 восстанавливается
2. Загрузка файлов — проверить что работает
3. Параллельные скачивания — проверить что siblings не зависают
4. Долгая работа — проверить что конфиг обновляется
