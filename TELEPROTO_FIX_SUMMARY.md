# Teleproto — Итоговый отчёт по исправлениям

## Статус: Готово к тестированию

Последний коммит: `c20e12f`
Проект бота: `C:\Users\User\Documents\Project\Server_1`

---

## Что исправлено (11 июля 2026)

### 1. Issue #23 — Media download deadlock

**Проблема:** После 404 media DC все последующие скачивания зависали на 15 секунд (таймаут) и никогда не восстанавливались.

**Корень:** `_handleBadAuthKey` помечал слот как мёртвый, но НЕ отклонял pending запросы. `_connectSender` висел на `await sender.send()` до таймаута.

| Fix | Файл | Что делает |
|-----|------|------------|
| `_handleBadAuthKey` | `MTProtoSender.ts` | Reject pending с TIMEOUT + `userDisconnected = true` |
| `_onSenderBreak` | `Network.ts` | Kill siblings на том же DC при `resetMediaTempKey()` |
| SecurityError "auth key" | `MTProtoSender.ts` | Terminal error → `_handleBadAuthKey()` |
| MediaScheduler retry | `MediaScheduler.ts` | `TIMEOUT` в retry list |
| Transport errors | `MTProtoSender.ts` | 404 → kill slot, 429 → FloodWait, 444/unknown → reconnect |

**Цепочка восстановления:**
```
404 → _handleBadAuthKey() → reject pending + slot dead + siblings dead
     → recvLoop выходит
     → MediaScheduler catches TIMEOUT → continue (retry)
     → getSession() → slot dead → НОВЫЙ слот
     → новый temp key → bindTempAuthKey → OK
```

---

### 2. DD Codec

**Проблема:** `ConnectionTCPDDSecret` использовал `AbridgedPacketCodec` (EF) вместо `DDPacketCodec` (DD). Формат не совпадал → сервер не отвечал → таймаут.

| Файл | Исправление |
|------|-------------|
| `TCPDCSecret.ts` | `PacketCodecClass = DDPacketCodec` (был `AbridgedPacketCodec`) |
| `PaddedIntermediate.ts` | Server quick ACK detection (8-16 байт с `0xFFFFFFFF`) |
| `PaddedIntermediate.ts` | Override `checkTransportError` только для 404/429/444 |

---

### 3. Config refresh

**Проблема:** `help.GetConfig` загружался один раз и кэшировался. Если Telegram менял DC secrets, клиент использовал устаревший конфиг → неправильный кодек → зависание.

| Файл | Исправление |
|------|-------------|
| `TelegramClient.ts` | Метод `_refreshConfig()` |
| `updates.ts` | Обработчик `updateConfig` + periodic refresh каждые 60 мин |

---

### 4. Транспортные ошибки

| Код | Действие |
|-----|----------|
| 404 | `_handleBadAuthKey()` → kill slot + siblings → MediaScheduler retry |
| 429 | `FloodWaitError` → slot живой → MediaScheduler wait + retry |
| 444 | Reconnect → slot живой (как Nicegram) |
| Unknown | TIMEOUT → MediaScheduler retry |

---

### 5. Прочее

| Файл | Исправление |
|------|-------------|
| `Connection.ts` | INFO лог при выборе кодека |
| `updates.ts` | Закомментирован debug лог пинга |
| `SenderSlot.ts` | Добавлен death reason `auth-broken` |

---

## Коммиты (chronological)

```
c20e12f docs: add summary of all fixes with rollback instructions
a0d20c1 fix: correct order of transport error handling
33ee7a6 fix: use TIMEOUT error for auth key rejection
9740149 fix: retry on AUTH_KEY_INVALID error in MediaScheduler
ae30e96 fix: conservative transport error handling
abdfeba fix: remove redundant reconnect() on 404
344830b fix: use RPCError instead of generic Error
f677040 fix: log errors when marking slots as dead
617ec90 refactor: use 'auth-broken' for all death reasons
0837c81 fix: resolve media download deadlock (issue #23)
cd1ef49 fix: remove DC migration on 444
8a772fc refactor: remove redundant 444 handling
9749b23 feat: add config refresh mechanism
84b3f0a fix: complete transport codec fixes
dff89d1 fix: DD codec overrides checkTransportError
2974ae1 fix: detect DD server quick ACK
6d71642 fix: only detect known transport error codes
4d1d3c0 fix: use DDPacketCodec for ConnectionTCPDDSecret
```

---

## Если что-то пойдёт не так

Откатиться до стабильного состояния:
```bash
git checkout 4d1d3c0
```

Этот коммит содержит базовые исправления (DD codec + transport errors) без additional fixes для issue #23.

---

## Как тестировать

1. В `Server_1`: `rm -rf node_modules/teleproto && npm install`
2. Перезапустить бота
3. Скачать видео → проверить что работает
4. Скачать второе видео → проверить что не падает
5. Скачать параллельно несколько файлов → проверить что siblings не зависают
6. Смотреть логи на:
   - `[Codec: DDPacketCodec]` — правильный кодек
   - `[TempBinding] hasTempBinding=true isBound=true` — temp key работает
   - `Bound temp auth key for dc X` — ключ привязан
   - Нет `RequestTimeoutError` — нет зависаний

---

## Структура файлов

```
teleproto/
├── client/
│   ├── TelegramClient.ts          # _lookupDcOption, getDC, _refreshConfig
│   └── telegramBaseClient.ts      # _connectSender, дефолты
├── extensions/
│   └── Logger.ts                  # дефолт DEBUG
├── network/
│   ├── MTProtoSender.ts           # _handleBadAuthKey, transport errors
│   ├── Network.ts                 # _onSenderBreak, kill siblings
│   ├── Dcenter.ts                 # temp key state
│   ├── MediaScheduler.ts          # retry на TIMEOUT
│   ├── SenderSlot.ts              # death reasons
│   └── connection/
│       ├── Connection.ts          # базовый класс + INFO лог кодека
│       ├── TCPDCSecret.ts         # DD/TLS соединения
│       └── codec/
│           ├── Abridged.ts        # EF
│           ├── Intermediate.ts    # EE
│           └── PaddedIntermediate.ts # DD + server quick ACK
├── dist/                          # собранные JS файлы
└── FIXES_SUMMARY.md               # краткая сводка
```

---

## Telegram MTProto документация

- Transport: https://core.telegram.org/mtproto/mtproto-transports
- Auth key: https://core.telegram.org/mtproto/auth_key
- Quick ACK: раздел "Quick ack" в transport docs
- Transport errors: раздел "Transport errors" — 404, 429, 444
