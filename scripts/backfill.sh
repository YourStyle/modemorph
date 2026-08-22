#!/usr/bin/env bash
# One-shot DATA backfills that cannot be a .sql migration because they need the
# application image — network access to the partner feeds, the YML parser, the
# brand matcher. Run from deploy.sh AFTER the new backend image is up, because
# the code they execute lives inside that image.
#
# Why this file exists: migration 030 added wardrobe_items.brand, and nothing on
# the deploy path filled it. A backfill that only runs when a human remembers to
# `docker exec` it is a backfill that does not run — and until it runs, brand is
# NULL for the whole catalog and every card shows no brand at all.
#
# Each entry runs EXACTLY ONCE, tracked in the same schema_migrations table the
# SQL migrations use (a plain filename key, so `SELECT * FROM schema_migrations`
# still answers "what has been applied to this database?"). A failure here is
# logged and does NOT abort the deploy: a partner feed being down must not stop a
# release, and an unfilled brand column is the state we are already in. The key
# is only recorded on success, so the next deploy retries.
#
# "Success" is NOT the exit code alone. Once a key lands in schema_migrations,
# every future deploy prints "уже применён" and that exact key never runs again.
# So a run that exits 0 having done nothing would cost the whole catalog, once,
# forever. Each entry therefore carries a VERIFY query that must answer 1 against
# the database AFTER the run, and the key is written only when both the exit code
# and the verify agree. The verify is deliberately written here, in SQL, against
# the finished state — not inside the script being verified.
#
# And the verify must look at PROVENANCE, not just presence. A resolver with a
# fallback (the brand backfill has one: a dictionary built from the feed's own
# <vendor> values) answers almost every row even when its primary join is dead,
# so "the column is populated" is not evidence that the primary path ran. See
# the brand entry below for the measured numbers.
#
# A key may also be VERSIONED — see BRAND_RESOLVER_REV. A one-shot whose resolver
# can get better is not a one-shot forever; keying the marker on the resolver's
# own bytes makes "we improved it" re-run it and "nothing changed" skip it.
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL="docker exec -i -e PGCLIENTENCODING=UTF8 modemorph-postgres psql -U modemorph -d modemorph -v ON_ERROR_STOP=1"
# -e PGCLIENTENCODING=UTF8: the verify queries carry Cyrillic literals ('ЦУМ').
PSQLQ="docker exec -e PGCLIENTENCODING=UTF8 modemorph-postgres psql -U modemorph -d modemorph -tA -v ON_ERROR_STOP=1"

$PSQL -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null

# run_once <key> <verify_sql> -- <command...>
#   verify_sql must SELECT exactly 1 when the backfill's effect is present in the
#   database. Empty string = no verify (exit code only).
run_once() {
  local key="$1" verify_sql="$2"; shift 2
  [ "${1:-}" = "--" ] && shift   # separator, so a multi-line SQL arg stays readable
  if [ "$($PSQLQ -c "SELECT 1 FROM schema_migrations WHERE filename='${key}'")" = "1" ]; then
    echo "   backfill: ${key} — уже применён"
    return 0
  fi
  echo "   backfill: ${key}"

  local failed=""
  "$@" || failed="команда вернула ненулевой код"

  # Verify runs even after a non-zero exit — a partially applied backfill should
  # say so out loud, and the two signals disagreeing is itself worth printing.
  if [ -n "$verify_sql" ]; then
    local verdict
    verdict="$($PSQLQ -c "${verify_sql}" 2>&1 | tr -d '[:space:]')" || verdict="ошибка-запроса"
    if [ "$verdict" != "1" ]; then
      failed="${failed:+${failed}; }проверка результата в базе вернула '${verdict}', а не 1"
    fi
  fi

  if [ -z "$failed" ]; then
    $PSQL -c "INSERT INTO schema_migrations (filename) VALUES ('${key}') ON CONFLICT DO NOTHING;" >/dev/null
    echo "   backfill: ${key} — ок"
  else
    FAILED_BACKFILLS="${FAILED_BACKFILLS}${FAILED_BACKFILLS:+, }${key}"
    echo "   ⚠️  backfill ${key} не отработал (${failed}); отметка НЕ поставлена, повторится на следующем деплое." >&2
    echo "      Вручную: docker exec modemorph-backend python3 scripts/backfill_brand.py   (план)" >&2
  fi
}

# Итог печатается по факту, а не безусловно: строка «backfills up to date» после
# провалившегося бэкфилла — это ровно тот рапорт об успехе, из-за которого
# незаполненную колонку никто и не замечает.
FAILED_BACKFILLS=""

# wardrobe_items.brand: <vendor> из фида по SKU, монобренд-константа, иначе
# суффикс названия по словарю вендоров того же магазина. Строки, где ответа нет,
# остаются NULL. Печатает план, потом применяет. ~130 МБ фидов, до ~3 минут.
# Монобрендовую часть (7861 строка) уже сделала миграция 031 — этот прогон
# добирает ЦУМ и ElytS и повторно их не трогает.
#
# ОТМЕТКА ВЕРСИОНИРОВАНА содержимым самого резолвера. brand.py + backfill_brand.py
# — это словарь, отсечка типов ключей и пороги; когда они меняются, скрипт умеет
# ответить лучше, чем в прошлый раз, а старая вечная отметка это запрещала (и
# --upgrade, который для этого и написан, не имел ни одного вызывающего). cksum
# по двум файлам: POSIX, есть везде, git не нужен. Обычный деплой их не трогает
# -> ключ тот же -> прогон пропускается. Старые ключи остаются в
# schema_migrations как история «каким резолвером заливали».
#
# --upgrade: строки со словарной маркой (догадка по названию) пересчитываются,
# и если фид теперь называет дом сам — метка становится feed_vendor. Значения
# feed_vendor/monobrand не трогаются никогда. Прогон идемпотентен: без изменений
# в фиде второй проход пишет 0 строк.
# `|| true` внутри группы: под `set -e` пропавший файл иначе уронил бы ВЕСЬ
# деплой на строке подсчёта контрольной суммы — а этот файл специально написан
# так, чтобы бэкфилл не мог остановить релиз.
BRAND_RESOLVER_REV="$({ cat backend/brand.py backend/scripts/backfill_brand.py || true; } | cksum | cut -d' ' -f1)"

# Проверка смотрит ровно на те 15243 строки, ради которых прогон и нужен: ЦУМ
# (15204) и ElytS (39) — единственные магазины, чью марку нельзя взять ни из
# константы, ни из миграции 031, только из живого фида.
#
# ДВА условия, и второе — не придирка. Первое (доля с маркой >= 0.90) слепо к
# тому, откуда марка взялась, а словарь резолвера строится из <vendor> ТОГО ЖЕ
# фида и отвечает без всякого джойна: замеры 2026-08-20 — 99.6% совпадений на
# сджойненных строках ЦУМа и 90.1% ответов на несджойненных. (Это про то,
# СКОЛЬКО раз словарь отвечает, а не про то, как часто он прав: сджойненные
# строки марку берут из <vendor>, словарь на них не вызывается вообще. Точность
# словаря меряется на своей выборке — backend/brand.py, match_brand_suffix,
# артефакт test/gauntlet/ours/brand/MEASUREMENT.json.) Значит прогон, у
# которого джойн по SKU не дал НИ ОДНОЙ строки (мерчант перевыпустил id,
# <vendorCode> занял место id — рутина), закрывает ЦУМ на 14808/15204 = 97.4%,
# проходит порог 0.90, получает вечную отметку — и 11620 строк, которые обязаны
# были читаться как «назвал мерчант», остаются «мы догадались». На дашборде
# админа число «назвал мерчант» упало бы с 11620 до ~50 без единого сигнала.
# Поэтому второе условие: доля brand_source='feed_vendor' >= 0.10 (замер:
# ЦУМ 11611/15204 = 76.4%, ElytS 9/39 = 23.1%; полный отказ джойна = 0%).
# Оба порога совпадают с MIN_SOURCE_COVERAGE / MIN_FEED_VENDOR_SHARE в скрипте.
# count(*)=0 считается пройденной проверкой: на пустой базе (свежий стенд,
# каталог ещё не импортирован) требовать долю не от чего.
run_once "backfill_brand.py@${BRAND_RESOLVER_REV}" \
  "SELECT CASE
            WHEN count(*) = 0 THEN 1
            WHEN count(*) FILTER (WHERE brand IS NOT NULL) < 0.90 * count(*) THEN 0
            WHEN count(*) FILTER (WHERE brand_source = 'feed_vendor') < 0.10 * count(*) THEN 0
            ELSE 1
          END
     FROM wardrobe_items
    WHERE split_part(notes, ':', 1) IN ('ЦУМ', 'ElytS')" \
  -- docker exec modemorph-backend python3 scripts/backfill_brand.py --commit --upgrade

if [ -n "$FAILED_BACKFILLS" ]; then
  # Деплой не валим (см. шапку), но и «всё хорошо» не рапортуем.
  echo "   ⚠️  backfills НЕ полны: ${FAILED_BACKFILLS} — повторятся на следующем деплое" >&2
else
  echo "   backfills up to date"
fi
