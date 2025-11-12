# CI/CD Setup для ModeMorph

Полная инструкция по настройке Continuous Integration и Continuous Deployment для проекта ModeMorph.

## 📋 Оглавление

- [Обзор](#обзор)
- [Предварительные требования](#предварительные-требования)
- [Настройка Self-Hosted Runner](#настройка-self-hosted-runner)
- [Настройка GitHub Secrets](#настройка-github-secrets)
- [Workflow файлы](#workflow-файлы)
- [Деплой](#деплой)
- [Мониторинг](#мониторинг)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)

## 🎯 Обзор

Наш CI/CD pipeline состоит из двух основных частей:

### CI (Continuous Integration)
Запускается при каждом push в `main` или `develop`, а также для всех Pull Requests:
- ✅ ESLint проверка кода
- ✅ TypeScript type checking
- ✅ Build проверка

### CD (Continuous Deployment)
Автоматически деплоит приложение на VPS при push в `main`:
- 🚀 Сборка Docker образов (App + Caddy)
- 🐳 Деплой через Docker Compose
- 🔒 Автоматический HTTPS с Let's Encrypt (Caddy)
- ✅ Health check приложения и reverse proxy

## 📦 Предварительные требования

### На VPS сервере:
- Ubuntu/Debian Linux (рекомендуется Ubuntu 22.04 LTS)
- Docker и Docker Compose (обязательно)
- Git
- Порты 80 и 443 открыты (для Caddy/HTTPS)
- Домен с настроенным DNS (для production)
- Минимум 2GB RAM, 2 CPU cores
- 10GB свободного места на диске

### На GitHub:
- Права администратора на репозиторий
- Доступ к Settings → Actions

## 🔧 Настройка Self-Hosted Runner

### Шаг 1: Подготовка сервера

Запустите скрипт установки зависимостей на вашем VPS:

```bash
# Скачайте репозиторий
git clone https://github.com/YourStyle/modemorph.git
cd modemorph

# Запустите скрипт установки
chmod +x scripts/setup-runner.sh
./scripts/setup-runner.sh
```

Этот скрипт установит:
- Docker и Docker Compose
- Node.js через nvm (для runner)
- pnpm (для runner)

### Шаг 2: Установка GitHub Actions Runner

1. Перейдите в Settings вашего репозитория:
   ```
   https://github.com/YourStyle/modemorph/settings/actions/runners/new
   ```

2. Выберите **Linux** и следуйте инструкциям:

```bash
# Создайте директорию для runner
mkdir ~/actions-runner && cd ~/actions-runner

# Скачайте последнюю версию runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Распакуйте
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Настройте runner (используйте токен из GitHub)
./config.sh --url https://github.com/YourStyle/modemorph --token YOUR_TOKEN

# Установите как сервис
sudo ./svc.sh install

# Запустите сервис
sudo ./svc.sh start

# Проверьте статус
sudo ./svc.sh status
```

3. Проверьте, что runner появился в списке:
   ```
   https://github.com/YourStyle/modemorph/settings/actions/runners
   ```

## 🔐 Настройка GitHub Secrets

Перейдите в Settings → Secrets and variables → Actions и добавьте следующие секреты:

### Обязательные секреты:

| Название | Описание | Пример |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL вашего Supabase проекта | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публичный ключ Supabase | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role ключ Supabase | `eyJhbGc...` |
| `NEXT_PUBLIC_AI_API_URL` | URL AI сервиса на Railway | `https://modemorph.up.railway.app/webhook` |
| `YANDEX_S3_ACCESS_KEY_ID` | Access Key для Yandex S3 | `YCAJxxx...` |
| `YANDEX_S3_SECRET_ACCESS_KEY` | Secret Key для Yandex S3 | `YCOxxx...` |
| `YANDEX_S3_BUCKET_NAME` | Имя S3 бакета | `modemorphs3` |
| `YANDEX_S3_REGION` | Регион S3 | `ru-central1` |
| `YANDEX_S3_ENDPOINT` | Endpoint S3 | `https://storage.yandexcloud.net` |
| `DOMAIN` | Ваш домен | `modemorph.ru` |
| `CADDY_EMAIL` | Email для Let's Encrypt | `admin@modemorph.ru` |

### Добавление секретов:

```bash
# Перейдите по ссылке
https://github.com/YourStyle/modemorph/settings/secrets/actions

# Нажмите "New repository secret"
# Введите название и значение
# Нажмите "Add secret"
```

## 📝 Workflow файлы

### CI Workflow (`.github/workflows/ci.yml`)

Выполняет проверки качества кода:

```yaml
- Установка зависимостей (pnpm)
- ESLint проверка
- TypeScript type check
- Build проверка
- Сохранение артефактов
```

**Триггеры:**
- Push в `main` или `develop`
- Pull Request в `main` или `develop`

### CD Workflow (`.github/workflows/cd.yml`)

Деплоит приложение через Docker Compose с Caddy:

```yaml
- Создание .env файла из секретов
- Остановка старых контейнеров
- Build Docker образов (App + Caddy)
- Запуск контейнеров через docker compose
- Проверка health check (app + Caddy)
- Очистка старых образов
- Вывод статуса и логов
```

**Триггеры:**
- Push в `main`
- Ручной запуск через UI

**Что деплоится:**
- Next.js приложение (modemorph-app)
- Caddy reverse proxy (modemorph-caddy)
- Автоматический HTTPS с Let's Encrypt

## 🚀 Деплой

### Автоматический деплой

Просто сделайте push в ветку `main`:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

GitHub Actions автоматически:
1. Запустит CI проверки
2. После успешных проверок запустит CD
3. Задеплоит на VPS

### Ручной деплой

Вы можете запустить деплой вручную:

1. Через GitHub UI:
   - Перейдите в Actions
   - Выберите "CD - Deploy to Production"
   - Нажмите "Run workflow"

2. Через скрипт на сервере:
   ```bash
   # Docker деплой (рекомендуется)
   ./scripts/deploy.sh docker

   # PM2 деплой (если нужно без Docker)
   ./scripts/deploy.sh pm2
   ```

## 📊 Мониторинг

### Проверка статуса деплоя

```bash
# Проверка контейнеров
docker ps | grep modemorph

# Логи приложения
docker logs modemorph-app -f

# Логи Caddy
docker logs modemorph-caddy -f

# Статус обоих контейнеров
docker compose --profile prod ps
```

### Health Check endpoint

```bash
# Через Caddy (production)
curl https://your-domain.com/api/health

# Через Caddy (localhost)
curl http://localhost/api/health

# Напрямую к приложению (для отладки)
docker exec modemorph-app wget -q -O- http://localhost:3000/api/health
```

Ответ должен быть:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "responseTime": "5ms",
  "environment": "production"
}
```

### Логи GitHub Actions

Все логи доступны в разделе Actions:
```
https://github.com/YourStyle/modemorph/actions
```

## ⏮️ Rollback

Если что-то пошло не так, вы можете откатиться к предыдущей версии:

### Через скрипт:

```bash
# Откат к предыдущему коммиту
./scripts/rollback.sh docker

# Откат к конкретному коммиту
./scripts/rollback.sh docker abc123

# С PM2
./scripts/rollback.sh pm2 abc123
```

### Ручной rollback:

```bash
# 1. Найдите нужный коммит
git log --oneline

# 2. Checkout к нему
git checkout <commit-hash>

# 3. Задеплойте
./scripts/deploy.sh docker  # или pm2
```

## 🐛 Troubleshooting

### Runner не подключается

```bash
# Проверьте статус сервиса
sudo systemctl status actions.runner.*

# Перезапустите
cd ~/actions-runner
sudo ./svc.sh restart

# Проверьте логи
journalctl -u actions.runner.* -f
```

### Build падает с ошибкой памяти

Увеличьте heap size в Dockerfile:
```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=4096"
```

### Docker контейнер не стартует

```bash
# Проверьте логи
docker logs modemorph-app

# Проверьте переменные окружения
docker exec modemorph-app env

# Пересоздайте контейнер
docker compose --profile prod down
docker compose --profile prod up -d
```

### Health check fails

```bash
# Проверьте, что приложение запущено
curl -v http://localhost:3000/api/health

# Проверьте логи
docker logs modemorph-app --tail 50
# или
pm2 logs modemorph --lines 50
```

### Секреты не применяются

1. Проверьте, что секреты добавлены в GitHub
2. Убедитесь, что названия секретов точно совпадают
3. Перезапустите workflow

## 📚 Дополнительные ресурсы

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

## 🆘 Поддержка

Если возникли проблемы:
1. Проверьте логи GitHub Actions
2. Проверьте логи на сервере
3. Проверьте health endpoint
4. Создайте issue в репозитории

---

**Последнее обновление:** $(date +%Y-%m-%d)
**Версия:** 1.0.0
