# ✅ CI/CD Setup Checklist для ModeMorph

Используйте этот чеклист для настройки CI/CD с нуля.

## 📋 Предварительная подготовка

- [ ] VPS сервер готов (Ubuntu 22.04 LTS рекомендуется)
- [ ] SSH доступ к серверу настроен
- [ ] Минимум 2GB RAM и 10GB свободного места
- [ ] Доменное имя настроено (опционально)
- [ ] Все учетные записи созданы:
  - [ ] GitHub репозиторий
  - [ ] Supabase проект
  - [ ] Yandex Cloud (для S3)
  - [ ] Railway (для AI сервиса)

## 🔧 Настройка сервера

### Шаг 1: Подключение к серверу

```bash
ssh user@your-server-ip
```

- [ ] Успешное подключение к серверу

### Шаг 2: Клонирование репозитория

```bash
cd ~
git clone https://github.com/YourStyle/modemorph.git
cd modemorph
```

- [ ] Репозиторий склонирован

### Шаг 3: Установка зависимостей

```bash
chmod +x scripts/setup-runner.sh
./scripts/setup-runner.sh
```

- [ ] Docker установлен
- [ ] Docker Compose установлен
- [ ] Node.js 20.18.1 установлен через nvm
- [ ] pnpm 9.15.0 установлен
- [ ] PM2 установлен (опционально)

Проверка:
```bash
docker --version
docker compose version
node --version
pnpm --version
pm2 --version  # если установлен
```

### Шаг 4: Настройка GitHub Actions Runner

```bash
mkdir ~/actions-runner && cd ~/actions-runner
```

- [ ] Директория создана
- [ ] Перейдите в GitHub: `https://github.com/YourStyle/modemorph/settings/actions/runners/new`
- [ ] Выполните команды из GitHub UI для установки runner
- [ ] Runner установлен как сервис: `sudo ./svc.sh install`
- [ ] Runner запущен: `sudo ./svc.sh start`
- [ ] Runner виден как "Idle" в GitHub UI

Проверка:
```bash
sudo ./svc.sh status
# Должен показать: active (running)
```

## 🔐 Настройка GitHub Secrets

Перейдите в: `https://github.com/YourStyle/modemorph/settings/secrets/actions`

Добавьте следующие секреты:

### Supabase
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### AI Service
- [ ] `NEXT_PUBLIC_AI_API_URL`

### Yandex S3
- [ ] `YANDEX_S3_ACCESS_KEY_ID`
- [ ] `YANDEX_S3_SECRET_ACCESS_KEY`
- [ ] `YANDEX_S3_BUCKET_NAME`
- [ ] `YANDEX_S3_REGION`
- [ ] `YANDEX_S3_ENDPOINT`

Проверка:
- [ ] Все 9 секретов добавлены
- [ ] Названия секретов точно совпадают (без опечаток)

## 📝 Настройка локального окружения

На вашем VPS сервере:

```bash
cd ~/modemorph
cp .env.example .env
nano .env  # или vim
```

- [ ] `.env` файл создан
- [ ] Все переменные заполнены корректными значениями
- [ ] Файл сохранен

## 🧪 Тестовый деплой

### Вариант A: С Docker (рекомендуется)

```bash
cd ~/modemorph
./scripts/deploy.sh docker
```

- [ ] Build прошел успешно
- [ ] Контейнер запустился
- [ ] Health check прошел: `curl http://localhost:3000/api/health`
- [ ] Приложение доступно: `curl http://localhost:3000`

### Вариант B: С PM2

```bash
cd ~/modemorph
./scripts/deploy.sh pm2
```

- [ ] Dependencies установлены
- [ ] Build прошел успешно
- [ ] PM2 процесс запущен
- [ ] Health check прошел
- [ ] Приложение доступно

## 🚀 Проверка CI/CD

### Тест CI

1. Создайте тестовую ветку:
```bash
git checkout -b test-ci
```

2. Сделайте небольшое изменение:
```bash
echo "# Test CI" >> TEST.md
git add TEST.md
git commit -m "test: CI workflow"
git push origin test-ci
```

3. Создайте Pull Request в GitHub UI

- [ ] CI workflow запустился
- [ ] ESLint проверка прошла
- [ ] TypeScript check прошел
- [ ] Build прошел успешно

### Тест CD

1. Смёрджите PR в main или сделайте прямой push:
```bash
git checkout main
git merge test-ci
git push origin main
```

- [ ] CD workflow запустился автоматически
- [ ] Build на self-hosted runner прошел
- [ ] Deployment завершился успешно
- [ ] Приложение обновилось
- [ ] Health check прошел

## 🔍 Проверка работы

### Проверки после деплоя

- [ ] Сайт открывается: `http://your-domain.com` или `http://your-server-ip:3000`
- [ ] Health endpoint работает: `/api/health`
- [ ] Можно залогиниться через Telegram
- [ ] Основные функции работают

### Логи

Проверьте логи для диагностики:

Docker:
```bash
docker logs modemorph-app --tail 50 -f
```

PM2:
```bash
pm2 logs modemorph --lines 50
```

- [ ] Нет критических ошибок в логах
- [ ] Приложение стартовало корректно

## 🎯 Финальные проверки

- [ ] GitHub Actions runner работает стабильно
- [ ] Автоматический деплой при push в main работает
- [ ] Rollback скрипт протестирован
- [ ] Health check endpoint отвечает корректно
- [ ] Мониторинг настроен (опционально)
- [ ] Backup настроен (опционально)
- [ ] SSL сертификат установлен (опционально)

## 📚 Документация

Убедитесь, что прочитали:

- [ ] [CI-CD-SETUP.md](./CI-CD-SETUP.md) - Полная документация
- [ ] [DEPLOYMENT.md](./DEPLOYMENT.md) - Быстрый старт
- [ ] GitHub Actions workflows в `.github/workflows/`
- [ ] Deployment скрипты в `scripts/`

## 🆘 В случае проблем

### Runner не работает
```bash
cd ~/actions-runner
sudo ./svc.sh restart
sudo ./svc.sh status
journalctl -u actions.runner.* -f
```

### Deployment падает
```bash
# Проверьте логи GitHub Actions
# Проверьте логи на сервере
docker logs modemorph-app --tail 100
# или
pm2 logs modemorph --lines 100
```

### Health check fails
```bash
curl -v http://localhost:3000/api/health
# Проверьте переменные окружения
docker exec modemorph-app env | grep NEXT_PUBLIC
```

## ✅ Чеклист завершен!

Если все пункты отмечены, ваш CI/CD pipeline полностью настроен и готов к использованию! 🎉

### Следующие шаги:

1. Настройте monitoring (Prometheus, Grafana)
2. Настройте alerting (email, Telegram)
3. Настройте автоматические backup
4. Настройте SSL сертификат (Let's Encrypt)
5. Настройте Nginx reverse proxy (если нужно)

---

**Дата настройки:** _________________
**Настроил:** _________________
**Версия:** 1.0.0
