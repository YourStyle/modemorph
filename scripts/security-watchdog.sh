#!/usr/bin/env bash
# Сторож: следит за тем, ЧЕРЕЗ ЧТО в сервер зашли 8 сентября 2026, и пишет в
# Telegram при первом же повторе.
#
# Тогда взлом прошёл незамеченным именно потому, что за этими местами никто не
# смотрел: чужой ключ дописали в authorized_keys (в логах такое не отражается
# вовсе), вошли по нему, поставили systemd-юнит и получили root через группу
# docker — без единой записи в sudo. Сторож закрывает эту слепую зону.
#
# Что проверяет:
#   1. authorized_keys (пользователя и root) — изменился состав ключей;
#   2. /etc/systemd/system — появился или изменился юнит;
#   3. успешные входы по SSH с пары «ключ+IP», которой раньше не было;
#   4. новые слушающие порты, открытые наружу;
#   5. root crontab.
#
# Состояние — в /var/lib/mm-watchdog. Первый запуск только запоминает эталон и
# ничего не шлёт, иначе первое же срабатывание было бы ложным.
#
# Ставится в cron раз в 5 минут (в crontab ROOT: под пользователем половина
# проверок молча вернула бы пустоту, а пустота здесь читается как «изменений
# нет» — сторож врал бы, что всё тихо):
#   */5 * * * * /home/tashernaut/apps/modemorph/scripts/security-watchdog.sh
set -uo pipefail

# Один прогон за раз. Без этого запуски накладываются: отправка одного
# сообщения занимает десятки секунд, тревог за прогон бывает пять, и следующий
# звонок будильника приходит раньше, чем закончился предыдущий. Копия молча
# уходит, а не ждёт очереди: ждать нечего, следующий прогон через пять минут
# увидит ровно то же состояние.
exec 9>/var/lock/mm-watchdog.lock
flock -n 9 || exit 0

STATE_DIR=/var/lib/mm-watchdog
ADMIN_CHAT_ID=416546809
# Токен нигде не копируем: сообщение отправляет сам контейнер бота, у которого
# BOT_TOKEN уже есть в окружении. Вторая копия секрета — это то, что потом
# забудут ротировать.
#
# Имя контейнера ищем по образцу, а не задаём константой. При переезде
# 10.09.2026 compose назвал бота modemorph-tma-app-modemorph-bot-1 вместо
# modemorph-bot — точное имя зависит от имени каталога проекта. Со старой
# константой сторож молча перестал бы доставлять: docker exec в несуществующее
# имя пишет ошибку в stderr, которую никто не читает.
BOT_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -m1 -E 'modemorph.*bot')
[ -n "$BOT_CONTAINER" ] || echo "watchdog: контейнер бота не найден — тревоги не уйдут" >&2

mkdir -p "$STATE_DIR"

# Отправка идёт ИЗНУТРИ контейнера бота и с ретраями — иначе тревога не дойдёт.
# С хоста api.telegram.org недостижим вовсе, а из контейнера пробивается не с
# первой попытки: в логах самого бота видно «Connection established (tryings =
# 41)». Одиночный curl с таймаутом 15с молча возвращал пустоту, то есть
# сигнализация существовала, но молчала.
#
# Скрипт передаётся на stdin, а не кладётся файлом: /tmp контейнера чистится
# при каждом пересоздании, и сторож бы тихо перестал работать после деплоя.
#
# Отправляем ЧЕРЕЗ hysteria-прокси. Напрямую api.telegram.org с этой машины
# недоступен вовсе: у самого бота 254 неудачных попытки против 5 удачных, он
# пробивается случайно и не сразу. Через прокси — 200 за 0,3 секунды.
# Сигнализация, которая доходит «когда повезёт», бесполезна.
#
# Бюджет попыток подобран под интервал крона: 8 попыток по 5 секунд — не больше
# минуты на сообщение, пять тревог укладываются в пять минут до следующего
# запуска. Прежние 40 попыток по 8 секунд давали до шести минут НА ОДНО
# сообщение и гарантированно переполняли интервал.
notify() {
    local text="$1"
    docker exec -i "$BOT_CONTAINER" python3 - "$ADMIN_CHAT_ID" "$text" <<'PY' 2>/dev/null || echo "watchdog: не доставлено: $text"
import os, socket, sys, time, urllib.request, urllib.parse

# Только IPv4. У api.telegram.org есть AAAA-запись, IPv6 в контейнере нет, и
# попытка уйти в него падает с Errno 101 ещё до всякой сети — выглядит как
# «сеть недоступна», хотя недоступен только IPv6.
_orig = socket.getaddrinfo
socket.getaddrinfo = lambda *a, **k: [x for x in _orig(*a, **k) if x[0] == socket.AF_INET]

PROXY = "http://172.18.0.1:1081"      # hysteria, тот же выход, что у OpenRouter

token = os.environ.get("BOT_TOKEN")
if not token:
    sys.exit("no BOT_TOKEN in bot container")
chat, text = sys.argv[1], sys.argv[2]
payload = urllib.parse.urlencode(
    {"chat_id": chat, "text": text, "parse_mode": "HTML"}).encode()
url = f"https://api.telegram.org/bot{token}/sendMessage"
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"https": PROXY, "http": PROXY}))
for attempt in range(1, 9):
    try:
        with opener.open(urllib.request.Request(url, data=payload), timeout=5) as r:
            sys.exit(0 if r.status == 200 else 1)
    except Exception:
        time.sleep(1)
sys.exit(1)
PY
}

# Сравнить текущее состояние с эталоном. Первый прогон — только запомнить.
# $1 — имя проверки, $2 — текущее значение, $3 — заголовок тревоги.
check() {
    local name="$1" current="$2" title="$3"
    local prev_file="$STATE_DIR/$name"

    # Сравниваем и храним ОДИНАКОВО нормализованным. prev=$(cat ...) срезает
    # завершающие переводы строки, а $current их содержит — без нормализации
    # состояние «не изменилось» выглядит как изменение, и сторож поднимает
    # ложную тревогу каждые пять минут. После такого его просто отключат.
    current=$(printf '%s' "$current")

    if [ ! -f "$prev_file" ]; then
        printf '%s' "$current" > "$prev_file"
        return
    fi
    local prev
    prev=$(cat "$prev_file")
    if [ "$prev" != "$current" ]; then
        local diff_text
        diff_text=$(diff <(printf '%s' "$prev") <(printf '%s' "$current") | grep -E '^[<>]' | head -10)
        # Считаем ДО экранирования, пока < и > ещё означают направление, а не
        # текст сообщения.
        local added removed
        added=$(printf '%s\n' "$diff_text" | grep -c '^>')
        removed=$(printf '%s\n' "$diff_text" | grep -c '^<')

        # Экранируем перед вставкой в HTML: строки diff начинаются с < и >, и
        # Telegram считает их незакрытыми тегами, отвечая 400. Тревога при этом
        # молча не доходит — самый неприятный вид поломки для сигнализации.
        diff_text=$(printf '%s' "$diff_text" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')

        # Заголовок обязан отвечать на вопрос «случилось ли что-то новое».
        # Тревога, где ничего не добавилось, а только исчезло, — это почти
        # всегда наша же уборка или смена формата эталона, и под заголовком
        # «Вход по SSH из новой сети» она читается как взлом. Ровно так и вышло
        # 11.09.2026: сообщение об исчезнувших записях пришлось разбирать
        # вручную, чтобы понять, что ничего не произошло.
        local head_line
        if [ "$added" -eq 0 ]; then
            head_line="🧹 <b>${title}</b> — записи только ИСЧЕЗЛИ (${removed}), нового нет"
        else
            head_line="🚨 <b>${title}</b> — новых записей: ${added}, исчезло: ${removed}"
        fi

        notify "${head_line}

<pre>${diff_text}</pre>

Хост: $(hostname -s)  $(date '+%d.%m %H:%M')"
        printf '%s' "$current" > "$prev_file"
    fi
}

# 1. Ключи доступа. Сравниваем отпечатки и комментарии, а не сами ключи:
#    в сообщение не должен попадать материал ключа.
keys_now=""
for f in /home/tashernaut/.ssh/authorized_keys /root/.ssh/authorized_keys; do
    [ -r "$f" ] || continue
    while read -r line; do
        [ -z "$line" ] && continue
        printf '%s\n' "$line" > /tmp/.wd_key.pub
        fp=$(ssh-keygen -lf /tmp/.wd_key.pub 2>/dev/null | awk '{print $2, $3}')
        keys_now+="$(basename "$(dirname "$(dirname "$f")")"): $fp"$'\n'
    done < "$f"
done
rm -f /tmp/.wd_key.pub
check "authorized_keys" "$keys_now" "SSH-ключи доступа"

# 2. systemd-юниты. Так появился automaticmachine.service.
units_now=$(ls -1 /etc/systemd/system/*.service 2>/dev/null | xargs -r -n1 basename | sort)
check "units" "$units_now" "systemd-юниты"

# 3. Успешные входы: ключ + СЕТЬ /16, а не точный адрес.
#
# Точный адрес давал поток ложных тревог. У владельца внешний адрес плавает: за
# сутки одним ключом вошли с восьми разных адресов (93.158.184.117,
# 93.158.186.19, 93.158.186.104, 195.239.121.210 и других), и сторож позвонил бы
# восемь раз. Сеть /16 сжимает эти восемь записей до двух, а смену провайдера —
# то, ради чего проверка и заведена, — по-прежнему ловит.
#
# Ключи CI исключены целиком: GitHub Actions стартует с раннеров Azure, адрес у
# них случайный на каждый запуск (замер: 4.154.236.228, 20.109.38.181,
# 172.184.209.120 — три запуска, три разные сети). «Новая сеть» для них норма, а
# не событие; их защита — секреты GitHub, а не этот сторож.
ci_fps=$(grep -h "github-actions" /home/tashernaut/.ssh/authorized_keys 2>/dev/null \
    | while read -r line; do
        [ -z "$line" ] && continue
        printf '%s\n' "$line" > /tmp/.wd_ci.pub
        # Обрезаем до 19 символов: ровно столько от отпечатка пишет sshd в лог.
        ssh-keygen -lf /tmp/.wd_ci.pub 2>/dev/null | awk '{print substr($2, 1, 19)}'
      done)
rm -f /tmp/.wd_ci.pub

# sed -n ... p — только совпавшие строки. Без -n несовпавшие проходят дальше
# КАК ЕСТЬ, и в эталон утекали целые строки журнала: любая из них потом читалась
# как изменение и поднимала ложную тревогу.
logins_now=$(grep -h "Accepted publickey" /var/log/auth.log /var/log/auth.log.1 2>/dev/null \
    | sed -nE 's|.*from ([0-9]+\.[0-9]+)\.[0-9]+\.[0-9]+ port .*(SHA256:[A-Za-z0-9+/]{12}).*|\2 \1.0.0/16|p' \
    | sort -u)
if [ -n "$ci_fps" ]; then
    logins_now=$(printf '%s\n' "$logins_now" | grep -vF "$ci_fps")
fi
check "logins" "$logins_now" "Входы по SSH"

# 4. Порты наружу. Бот поднимал свой uvicorn и держал MySQL открытым в мир.
ports_now=$(ss -tlnH 2>/dev/null | awk '{print $4}' \
    | grep -vE '^(127\.|\[::1\]|172\.18\.)' | sort -u)
check "ports" "$ports_now" "Порты, открытые наружу"

# 5. root crontab.
cron_now=$(crontab -l -u root 2>/dev/null | grep -v '^#' | sort)
check "root_cron" "$cron_now" "root crontab"
