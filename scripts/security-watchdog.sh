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
# Ставится в cron раз в 5 минут:
#   */5 * * * * /home/tashernaut/apps/modemorph/scripts/security-watchdog.sh
set -uo pipefail

STATE_DIR=/var/lib/mm-watchdog
ENV_FILE=/home/tashernaut/apps/modemorph/.env
ADMIN_CHAT_ID=416546809

mkdir -p "$STATE_DIR"

# Токен берём из того же .env, что и приложение, — чтобы не заводить вторую
# копию секрета, которую потом забудут ротировать.
BOT_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d "\"'")

notify() {
    local text="$1"
    [ -z "$BOT_TOKEN" ] && { echo "no token: $text"; return; }
    curl -s -m 15 -o /dev/null \
        --data-urlencode "text=$text" \
        -d "chat_id=${ADMIN_CHAT_ID}" -d "parse_mode=HTML" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" || true
}

# Сравнить текущее состояние с эталоном. Первый прогон — только запомнить.
# $1 — имя проверки, $2 — текущее значение, $3 — заголовок тревоги.
check() {
    local name="$1" current="$2" title="$3"
    local prev_file="$STATE_DIR/$name"
    if [ ! -f "$prev_file" ]; then
        printf '%s' "$current" > "$prev_file"
        return
    fi
    local prev
    prev=$(cat "$prev_file")
    if [ "$prev" != "$current" ]; then
        local diff_text
        diff_text=$(diff <(printf '%s' "$prev") <(printf '%s' "$current") | grep -E '^[<>]' | head -10)
        notify "🚨 <b>${title}</b>

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
check "authorized_keys" "$keys_now" "Изменились SSH-ключи доступа"

# 2. systemd-юниты. Так появился automaticmachine.service.
units_now=$(ls -1 /etc/systemd/system/*.service 2>/dev/null | xargs -r -n1 basename | sort)
check "units" "$units_now" "Изменился список systemd-юнитов"

# 3. Новые «ключ + IP» среди успешных входов. Именно так выглядел вход
#    с 91.245.225.164 — адрес, которого не было ни разу за месяц.
logins_now=$(grep -h "Accepted publickey" /var/log/auth.log /var/log/auth.log.1 2>/dev/null \
    | sed -E 's/.*from ([0-9.]+) port.*(SHA256:[A-Za-z0-9+\/]{12}).*/\2 \1/' \
    | sort -u)
check "logins" "$logins_now" "Вход по SSH с новой пары ключ+адрес"

# 4. Порты наружу. Бот поднимал свой uvicorn и держал MySQL открытым в мир.
ports_now=$(ss -tlnH 2>/dev/null | awk '{print $4}' \
    | grep -vE '^(127\.|\[::1\]|172\.18\.)' | sort -u)
check "ports" "$ports_now" "Появился новый порт, открытый наружу"

# 5. root crontab.
cron_now=$(crontab -l -u root 2>/dev/null | grep -v '^#' | sort)
check "root_cron" "$cron_now" "Изменился root crontab"
