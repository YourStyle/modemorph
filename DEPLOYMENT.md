# 🚀 Быстрый старт деплоя ModeMorph

Краткая инструкция для быстрого развёртывания приложения.

## Метод 1: Docker + Caddy (Рекомендуется)

### Требования
- Docker и Docker Compose
- .env файл с переменными окружения
- Домен (для SSL сертификатов)

### Деплой

```bash
# 1. Создайте .env файл
cp .env.example .env
# Заполните все переменные, особенно:
# DOMAIN=your-domain.com
# CADDY_EMAIL=admin@your-domain.com

# 2. Запустите production build
docker compose --profile prod up -d

# 3. Проверьте статус
docker ps
# Должны быть запущены: modemorph-app и modemorph-caddy

# 4. Проверьте health (через Caddy)
curl https://your-domain.com/api/health
# или для localhost:
curl http://localhost/api/health
```

**Важно:**
- Приложение теперь доступно через порты 80/443 (Caddy), а не 3000
- Caddy автоматически получает SSL сертификаты Let's Encrypt
- Убедитесь что DNS вашего домена указывает на IP сервера

### Команды

```bash
# Остановить все контейнеры
docker compose --profile prod down

# Обновить после изменений
docker compose --profile prod up -d --build

# Логи приложения
docker logs modemorph-app -f

# Логи Caddy (reverse proxy)
docker logs modemorph-caddy -f

# Перезапуск приложения
docker restart modemorph-app

# Перезапуск Caddy
docker restart modemorph-caddy

# Перезапуск всего
docker compose --profile prod restart
```

## Метод 2: PM2

### Требования
- Node.js 20.18.1
- pnpm 9.15.0
- PM2

### Деплой

```bash
# 1. Установите зависимости
pnpm install --frozen-lockfile

# 2. Создайте .env файл
cp .env.example .env
# Заполните все переменные

# 3. Соберите приложение
pnpm build

# 4. Запустите с PM2
pm2 start pnpm --name modemorph -- start
pm2 save
```

### Команды

```bash
# Статус
pm2 status

# Логи
pm2 logs modemorph

# Перезапуск
pm2 restart modemorph

# Остановить
pm2 stop modemorph
```

## Метод 3: Автоматический скрипт

Используйте готовый скрипт деплоя:

```bash
# С Docker
./scripts/deploy.sh docker

# С PM2
./scripts/deploy.sh pm2
```

## CI/CD с GitHub Actions

Для автоматического деплоя при push в `main`:

1. Настройте Self-Hosted Runner на VPS:
   ```bash
   ./scripts/setup-runner.sh
   ```

2. Добавьте GitHub Secrets в репозиторий

3. Push в main - автоматический деплой!

📖 **Полная документация:** См. [CI-CD-SETUP.md](./CI-CD-SETUP.md)

## Переменные окружения

Создайте `.env` файл со следующими переменными:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Service
NEXT_PUBLIC_AI_API_URL=https://your-ai-service.railway.app/webhook

# Yandex S3
YANDEX_S3_ACCESS_KEY_ID=your-access-key
YANDEX_S3_SECRET_ACCESS_KEY=your-secret-key
YANDEX_S3_BUCKET_NAME=your-bucket-name
YANDEX_S3_REGION=ru-central1
YANDEX_S3_ENDPOINT=https://storage.yandexcloud.net

# Caddy (для Docker деплоя)
DOMAIN=your-domain.com
CADDY_EMAIL=admin@your-domain.com
```

## Health Check

Проверьте, что приложение работает:

```bash
# Через Caddy (рекомендуется)
curl https://your-domain.com/api/health
# или для localhost:
curl http://localhost/api/health

# Напрямую к приложению (только для отладки)
docker exec modemorph-app wget -q -O- http://localhost:3000/api/health
```

Ожидаемый ответ:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "responseTime": "5ms",
  "environment": "production"
}
```

## Rollback

Если что-то пошло не так:

```bash
# Откатиться к предыдущей версии
./scripts/rollback.sh docker  # или pm2

# Откатиться к конкретному коммиту
./scripts/rollback.sh docker abc123
```

## Troubleshooting

### Docker контейнер не стартует
```bash
docker logs modemorph-app --tail 50
```

### PM2 процесс падает
```bash
pm2 logs modemorph --lines 50
```

### Health check fails
```bash
# Проверьте переменные окружения
docker exec modemorph-app env | grep NEXT_PUBLIC
# или
pm2 env modemorph
```

---

## 🌐 Дополнительно: Caddy

Полная документация по Caddy: [CADDY-SETUP.md](./CADDY-SETUP.md)

**Ключевые моменты:**
- ✅ Автоматический HTTPS с Let's Encrypt
- ✅ HTTP/2 и HTTP/3 поддержка
- ✅ Кеширование статических файлов
- ✅ Security headers из коробки
- ✅ Автоматическое обновление SSL сертификатов

💡 **Совет:** Используйте Docker + Caddy для production и PM2 для development/staging серверов.
