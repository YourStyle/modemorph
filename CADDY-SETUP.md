# 🌐 Caddy Reverse Proxy Setup для ModeMorph

Документация по настройке и использованию Caddy в качестве reverse proxy для ModeMorph.

## 📋 Оглавление

- [Что такое Caddy?](#что-такое-caddy)
- [Преимущества](#преимущества)
- [Архитектура](#архитектура)
- [Быстрый старт](#быстрый-старт)
- [Конфигурация](#конфигурация)
- [SSL/TLS](#ssltls)
- [Мониторинг](#мониторинг)
- [Troubleshooting](#troubleshooting)

## 🤔 Что такое Caddy?

Caddy - это современный веб-сервер и reverse proxy с автоматическим HTTPS. В нашем проекте Caddy:
- Принимает все входящие HTTP/HTTPS запросы
- Автоматически получает и обновляет SSL сертификаты
- Проксирует запросы к Next.js приложению
- Кеширует статические файлы
- Добавляет security заголовки

## ✨ Преимущества

### Автоматический HTTPS
- ✅ Автоматическое получение сертификатов Let's Encrypt
- ✅ Автоматическое обновление сертификатов
- ✅ HTTP/3 и HTTP/2 поддержка
- ✅ Redirect с HTTP на HTTPS

### Простота конфигурации
- 📝 Простой Caddyfile вместо сложного nginx.conf
- 🔧 Минимальная конфигурация
- 🚀 Работает out of the box

### Производительность
- ⚡ Быстрая обработка запросов
- 📦 Умное кеширование статики
- 🗜️ Автоматическое сжатие (gzip, zstd)

## 🏗️ Архитектура

```
Internet
    ↓
[Caddy :80, :443]  ← SSL/TLS, HTTP/3, Caching
    ↓
[Next.js App :3000]  ← Docker Container
    ↓
[Supabase, S3, AI Service]
```

**Важно:** Next.js приложение больше не доступно напрямую через порт 3000. Все запросы идут через Caddy.

## 🚀 Быстрый старт

### 1. Настройте домен

В вашем `.env` файле:
```env
DOMAIN=your-domain.com
CADDY_EMAIL=admin@your-domain.com
```

Для локальной разработки:
```env
DOMAIN=localhost
CADDY_EMAIL=admin@example.com
```

### 2. Убедитесь, что DNS настроен

Ваш домен должен указывать на IP сервера:
```bash
# Проверка DNS
dig your-domain.com +short
# Должен вернуть IP вашего сервера
```

### 3. Запустите деплой

```bash
# С помощью скрипта
./scripts/deploy.sh docker

# Или напрямую
docker compose --profile prod up -d
```

### 4. Проверка

```bash
# Проверьте, что контейнеры запущены
docker ps | grep modemorph

# Проверьте логи Caddy
docker logs modemorph-caddy -f

# Проверьте сайт
curl https://your-domain.com/api/health
```

## ⚙️ Конфигурация

### Caddyfile

Основная конфигурация в файле `Caddyfile`:

```caddyfile
{$DOMAIN} {
    encode zstd gzip

    # Кеширование статики Next.js
    @static path /_next/static/* /favicon.ico /robots.txt /sitemap.xml /images/* /public/*
    handle @static {
        header Cache-Control "public, max-age=31536000, immutable"
        reverse_proxy app:3000
    }

    # Все остальные запросы
    reverse_proxy app:3000

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer-when-downgrade"
    }
}
```

### Docker Compose интеграция

В `docker-compose.yml` Caddy настроен так:

```yaml
caddy:
  image: caddy:2-alpine
  container_name: modemorph-caddy
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
    - "443:443/udp"  # HTTP/3
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy_data:/data
    - caddy_config:/config
  environment:
    - DOMAIN=${DOMAIN}
    - EMAIL=${CADDY_EMAIL}
  depends_on:
    app:
      condition: service_healthy
```

### Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DOMAIN` | Ваш домен | `modemorph.ru` |
| `CADDY_EMAIL` | Email для Let's Encrypt | `admin@modemorph.ru` |

## 🔒 SSL/TLS

### Автоматические сертификаты

Caddy автоматически:
1. Получает SSL сертификат от Let's Encrypt
2. Настраивает HTTPS
3. Делает redirect с HTTP на HTTPS
4. Обновляет сертификаты до истечения срока

### Первый запуск

При первом запуске Caddy:
- Проверяет DNS записи
- Отправляет запрос Let's Encrypt
- Получает сертификат (займет ~30 секунд)
- Начинает обслуживать HTTPS

**Важно:** Убедитесь, что порты 80 и 443 открыты в firewall!

### Проверка SSL

```bash
# Проверка сертификата
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Проверка рейтинга SSL
# Откройте: https://www.ssllabs.com/ssltest/
```

### Локальная разработка

Для `DOMAIN=localhost` Caddy не будет запрашивать SSL сертификат:
```bash
# Локально
curl http://localhost/api/health
```

### Свой SSL сертификат

Если у вас уже есть сертификат, обновите Caddyfile:
```caddyfile
your-domain.com {
    tls /path/to/cert.pem /path/to/key.pem
    reverse_proxy app:3000
}
```

## 📊 Мониторинг

### Проверка статуса

```bash
# Статус контейнера
docker ps | grep caddy

# Логи в реальном времени
docker logs modemorph-caddy -f

# Последние 50 строк логов
docker logs modemorph-caddy --tail 50
```

### Метрики (опционально)

Caddy может экспортировать метрики в Prometheus. Добавьте в Caddyfile:
```caddyfile
{
    servers {
        metrics
    }
}
```

Метрики будут доступны на `:2019/metrics`

### Логи

Caddy пишет логи в JSON формате:
```json
{
  "level": "info",
  "ts": 1234567890,
  "msg": "handled request",
  "request": {
    "remote_ip": "1.2.3.4",
    "proto": "HTTP/2.0",
    "method": "GET",
    "host": "your-domain.com",
    "uri": "/api/health"
  },
  "duration": 0.123,
  "status": 200
}
```

## 🔧 Расширенная конфигурация

### Кастомные заголовки

```caddyfile
your-domain.com {
    header {
        # Content Security Policy
        Content-Security-Policy "default-src 'self'"

        # Permissions Policy
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }

    reverse_proxy app:3000
}
```

### Rate limiting

```caddyfile
your-domain.com {
    # 100 запросов в минуту на IP
    rate_limit {
        zone dynamic {
            key {remote_host}
            events 100
            window 1m
        }
    }

    reverse_proxy app:3000
}
```

### Несколько доменов

```caddyfile
modemorph.ru, www.modemorph.ru {
    # www redirect на основной домен
    @www host www.modemorph.ru
    redir @www https://modemorph.ru{uri}

    reverse_proxy app:3000
}
```

### Поддомены

```caddyfile
# API поддомен
api.modemorph.ru {
    reverse_proxy app:3000
}

# Admin поддомен
admin.modemorph.ru {
    reverse_proxy app:3000
}

# Основной домен
modemorph.ru {
    reverse_proxy app:3000
}
```

## 🐛 Troubleshooting

### Caddy не запускается

```bash
# Проверьте логи
docker logs modemorph-caddy

# Проверьте Caddyfile на ошибки
docker exec modemorph-caddy caddy validate --config /etc/caddy/Caddyfile
```

Частые проблемы:
- Порты 80/443 уже заняты
- Неправильный синтаксис Caddyfile
- DNS не настроен

### Ошибка получения SSL сертификата

```
obtaining certificate: [...] acme: error: 403
```

**Причины:**
1. DNS не указывает на ваш сервер
2. Порты 80/443 закрыты в firewall
3. Превышен лимит Let's Encrypt

**Решение:**
```bash
# Проверьте DNS
dig +short your-domain.com

# Проверьте порты
sudo netstat -tlnp | grep -E ':(80|443)'

# Проверьте firewall
sudo ufw status
```

### SSL работает, но сайт недоступен

```bash
# Проверьте, что app контейнер работает
docker ps | grep modemorph-app

# Проверьте логи app
docker logs modemorph-app --tail 50

# Проверьте сеть
docker network inspect modemorph_modemorph-network
```

### Caddy не видит app контейнер

```bash
# Проверьте, что оба контейнера в одной сети
docker inspect modemorph-caddy | grep Networks
docker inspect modemorph-app | grep Networks

# Перезапустите с пересозданием сети
docker compose --profile prod down
docker compose --profile prod up -d
```

### 502 Bad Gateway

```bash
# Проверьте health check app
docker exec modemorph-app wget -q -O- http://localhost:3000/api/health

# Если app не отвечает - смотрите логи
docker logs modemorph-app

# Перезапустите app
docker restart modemorph-app
```

### Медленное получение сертификата

Let's Encrypt может занять до 60 секунд. Это нормально при первом запуске.

```bash
# Следите за процессом
docker logs modemorph-caddy -f | grep -i certificate
```

### Сертификат не обновляется

Caddy автоматически обновляет сертификаты. Если есть проблемы:

```bash
# Проверьте когда истекает сертификат
docker exec modemorph-caddy caddy list-certificates

# Принудительно обновить
docker restart modemorph-caddy
```

## 📚 Полезные команды

```bash
# Перезапуск Caddy
docker restart modemorph-caddy

# Перезагрузка конфигурации без downtime
docker exec modemorph-caddy caddy reload --config /etc/caddy/Caddyfile

# Проверка конфигурации
docker exec modemorph-caddy caddy validate --config /etc/caddy/Caddyfile

# Список активных сертификатов
docker exec modemorph-caddy caddy list-certificates

# Очистка кеша Caddy
docker volume rm modemorph_caddy_data
docker volume rm modemorph_caddy_config

# Полный перезапуск всего стека
docker compose --profile prod restart
```

## 🔗 Полезные ссылки

- [Caddy Documentation](https://caddyserver.com/docs/)
- [Caddyfile Tutorial](https://caddyserver.com/docs/caddyfile/concepts)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)

---

**Последнее обновление:** $(date +%Y-%m-%d)
