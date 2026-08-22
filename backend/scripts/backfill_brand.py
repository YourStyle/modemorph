#!/usr/bin/env python3
"""Заполняет wardrobe_items.brand для каталога, который приехал без бренда.

Зачем. До миграции 030 колонки brand не было вообще, и шесть мест в коде делали
`notes.split(":")[0]` и называли результат «брендом». В notes лежит
"<МАГАЗИН>:<SKU>", то есть МАГАЗИН, а не марка: 15204 из 24355 строк с notes —
это ЦУМ, поэтому пальто Saint Laurent на 62% каталога подписывалось «ЦУМ» и на
карточке, и в промпте Gemini. Импортёры с 2026-08-20 пишут <vendor> сами; этот
скрипт разбирается с тем, что уже лежит в базе.

Три источника значения, в порядке доверия (пишутся в brand_source):

  feed_vendor  Фид перекачивается заново, строка джойнится по SKU из notes и
               берётся её собственный <vendor>. Для ЦУМ SKU — это АТРИБУТ id
               оффера: тега <model> в этом фиде нет вообще (проверено на живом
               фиде 2026-08-20), поэтому индекс строится по нескольким ключам.
               Джойнить можно только по тегу, который ВЕДЁТ СЕБЯ как
               идентификатор: у ElytS <model> — это цвет (25 значений на 81616
               офферов), и такой тег в индекс не берётся целиком. Подробности и
               замеры — у MIN_KEY_CARDINALITY ниже.
  monobrand    У магазина в фиде нет <vendor>, и он торгует одним домом
               (SELA, Lacoste, 2moodstore, LOVE REPUBLIC) — берётся константа
               из backend/brand.py.
  dictionary   Строка не сджойнилась. Тогда — и только тогда — работает
               подстрочный матчер: словарь собирается ИЗ ФАКТИЧЕСКИХ <vendor>
               ЭТОГО ЖЕ МАГАЗИНА и ищется самым длинным суффиксом в item_name.
               Словарь пер-магазинный намеренно: строка ЦУМа может получить
               только тот дом, который сам ЦУМ и называет в своём фиде.

               ТОЧНОСТЬ считается на той выборке, где матчер работает. Раньше
               здесь стояло «на 11611 строках совпал с <vendor> 11569 раз и не
               ошибся ни разу» — но 11611 это как раз сджойнившиеся строки, на
               которых plan_updates берёт <vendor> и матчер не вызывается
               вообще (`if vendor:` ниже). Для 3356 строк, которые матчер
               реально обслуживает, там был только процент ОТВЕТОВ (90.1%), а
               доли ошибок не было никакой. Замер по правильной выборке —
               в docstring match_brand_suffix (backend/brand.py), артефакт
               test/gauntlet/ours/brand/MEASUREMENT.json. Коротко: правда —
               <vendor> 8910 живых офферов ЦУМа; когда дом ещё продаётся,
               8893 совпадения и 0 ошибок; когда дом снят с продажи
               (leave-one-house-out) — 8898 молчаний и 12 ошибок (0.13%), все
               двенадцать это суб-марка вместо родительской (Polo Ralph Lauren →
               Ralph Lauren). На 3356 строках прода ожидаемое число чужих марок
               — 0.5.

Никаких других способов получить бренд тут нет и быть не должно. Марка, которой
не называл ни один мерчант, — это выдумка, а выдуманная марка в партнёрском
отчёте хуже, чем NULL. Строки, для которых ответа нет, остаются NULL.

План на 2026-08-20 (пересчитан на живых фидах и на всех 24355 строках прода с
notes, снятых через COPY ... TO STDOUT; в прод НЕ применялся — доступ на чтение):

    магазин                       строк  feed_vendor  monobrand  dictionary   NULL
    ЦУМ                           15204        11611          0        3239    354
    SELA                           5155            0       5155           0      0
    Интернет-магазин Lacoste       1642            0       1642           0      0
    Unknown (gate31)               1250            0          0           0   1250
    2moodstore                      585            0        585           0      0
    LOVE REPUBLIC                   479            0        479           0      0
    ElytS                            39            9          0          30      0
    https (битые notes)               1            0          0           0      1
    ИТОГО                         24355        11620       7861        3269   1605

Это СНИМОК, а не константа: колонки feed_vendor и dictionary делятся по тому,
лежит ли SKU строки в СЕГОДНЯШНЕМ фиде. Пересчёт вечером того же дня (фид отдал
8910 офферов вместо 8964) даёт по ЦУМу 11494 / 3356 / 354 при тех же 15204
строках — товары уходят из продажи, и строки переезжают из feed_vendor в
dictionary. Поэтому пороги ниже стоят с запасом в разы, а не впритык к этим
числам, и поэтому же ни одно из них не является точностью матчера: точность
меряется отдельно и на своей выборке (см. `dictionary` выше).
Пересчёт воспроизводится: test/gauntlet/ours/brand/scripts/split_population.py.

У ElytS 9, а не 18: ровно 9 строк из 39 хранят в notes числовой id оффера, а
у остальных 30 в notes лежит ЦВЕТ («Светло-серый»), потому что импортёр берёт
SKU как `model or id`. Шесть цветов в фиде случайно уникальны по марке, и до
отсечки типов ключей эти строки джойнились и получали метку feed_vendor —
«так сказал мерчант» — за джойн по слову «Светло-серый». Теперь они получают
ту же марку из названия и честную метку dictionary.

1605 строк осознанно остаются без бренда: у gate31 («Unknown» в notes) фида нет,
названия у него русские и придуманные («Бомбер Севилья»), словарь ЦУМа на них не
срабатывает ни разу — и не должен. Второй прогон меняет 0 строк.

КОД ВОЗВРАТА — это не «скрипт не упал», а «работа сделана». Прогон, который не
скачал фид ЦУМа, отработал бы совершенно молча: словарь ЦУМа собирается ИЗ ЭТОГО
ЖЕ ФИДА, поэтому без него и джойн, и словарь пусты, monobrand_for_source('ЦУМ')
справедливо возвращает None — и все 15204 строки просто пропускаются. План
печатается, ошибок нет, выход 0. А scripts/backfill.sh на нуле ставит отметку в
schema_migrations НАВСЕГДА, и следующий деплой скажет «уже применён». 62%
каталога остались бы без марки необратимо. Поэтому:

  * фид, без которого строки не могут получить бренд, — ОБЯЗАТЕЛЬНЫЙ (какие
    именно — считает required_feed_sources(): магазин есть в ADMITAD_FEEDS, его
    строки есть в базе, и монобренд-константы у него нет, то есть ЦУМ и ElytS);
    не скачался такой фид — код возврата 1. Скачался, но НИ ОДИН тип ключа не
    прошёл отсечку на идентификатор (джойнить не по чему) — тоже 1;
  * после прогона по каждому обязательному магазину проверяется ДОЛЯ строк с
    маркой (check_coverage). Ниже MIN_SOURCE_COVERAGE — код возврата 1, даже
    если ни одного исключения не было: фид мог отдать 200 OK и HTML, или
    переименовать <vendor>, и оба раза «ошибки» нет, а работы нет тоже;
  * и ОТДЕЛЬНО — доля строк, чью марку назвал мерчант (brand_source =
    'feed_vendor'). Ниже MIN_FEED_VENDOR_SHARE — код возврата 1. Проверка на
    «есть марка» этого не ловит: словарь собирается из <vendor> ТОГО ЖЕ фида и
    отвечает на 90–99% строк вообще без джойна, поэтому развалившийся джойн по
    SKU (мерчант перевыпустил id, <vendorCode> занял место id) даёт у ЦУМа
    11569 + 3239 = 14808 из 15204 = 97.4% «полноты» и ноль настоящих джойнов.
    Отметка бы встала, и 11620 строк навсегда читались бы как «мы догадались».

Записанное при этом остаётся записанным: магазины независимы, а прогон
идемпотентен, поэтому падение на ElytS не мешает ЦУМу залиться, и следующий
деплой доберёт остаток.

По умолчанию НИЧЕГО НЕ ПИШЕТ — печатает план. Скрипт лежит в образе бэкенда
(backend/Dockerfile: COPY . ., WORKDIR /app), поэтому запускается по пути:

    # план (по умолчанию)
    docker exec modemorph-backend python3 scripts/backfill_brand.py
    # только один магазин
    docker exec modemorph-backend python3 scripts/backfill_brand.py --source ЦУМ
    # применить
    docker exec modemorph-backend python3 scripts/backfill_brand.py --commit

На деплое это делает scripts/backfill.sh (вызывается из scripts/deploy.sh после
подъёма нового бэкенда) — ровно один раз, с отметкой в schema_migrations.

Чистая часть без сети и базы:
    PYTHONPATH=backend python3 backend/scripts/test_brand_match.py
"""

import argparse
import asyncio
import collections
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from brand import (  # noqa: E402
    BRAND_SOURCE_DICTIONARY,
    BRAND_SOURCE_FEED_VENDOR,
    BRAND_SOURCE_MONOBRAND,
    build_brand_dictionary,
    match_brand_suffix,
    monobrand_for_source,
    normalize_brand,
    retailer_from_notes,
)

# Списка «многобрендовых магазинов» тут намеренно нет: он берётся из самих
# фидов на лету. Если у скачанного фида нет ни одного <vendor> (2moodstore —
# 0 из 6389 офферов), словарь для него просто не соберётся и ни одна его строка
# не получит бренд из словаря. Захардкоженный список рано или поздно разойдётся
# с фидом, а разошедшийся список — это марка не того дома.
#
# ЦУМ — 20 МБ, ElytS — 98 МБ; таймаут по фиду, а не на весь прогон.
FEED_TIMEOUT = 300.0

# Минимальная доля строк с маркой у ОБЯЗАТЕЛЬНОГО магазина после прогона.
# Ожидания по плану 2026-08-20: ЦУМ 14850/15204 = 97.7% (354 строки честно без
# ответа), ElytS 39/39 = 100%. 0.90 — это запас в три с лишним раза от текущего
# промаха и одновременно порог, который НЕ переживёт пустой фид (0%), фид без
# <vendor> (0%) и отданный вместо XML HTML (0%, разбор упадёт раньше).
MIN_SOURCE_COVERAGE = 0.90

# Минимальная доля строк, чью марку НАЗВАЛ МЕРЧАНТ (brand_source='feed_vendor'),
# у обязательного магазина.
#
# Зачем отдельный порог, если полнота уже проверяется. Полнота слепа к тому,
# ОТКУДА взялось значение, а словарь собирается из <vendor> того же фида и
# работает даже когда джойн по SKU не даёт НИ ОДНОЙ строки. Замеры 2026-08-20:
# словарь совпадает с <vendor> на 99.6% сджойненных строк ЦУМа и отвечает на
# 90.1% несджойненных. Значит при полном отказе джойна (мерчант перевыпустил
# id, <vendorCode> занял место id — рутинные события) фид всё так же качается,
# словарь всё так же строится, и ЦУМ закрывается на 11569 + 3239 = 14808 из
# 15204 = 97.4%. Это ВЫШЕ MIN_SOURCE_COVERAGE. Прогон объявил бы себя успешным,
# scripts/backfill.sh поставил бы отметку, и 11620 строк, которые обязаны были
# читаться как feed_vendor, навсегда остались бы с меткой dictionary —
# «мы догадались». Ровно тот тихий успех, ради которого этот скрипт и написан,
# только этажом выше.
#
# 0.10 стоит между нулём (джойн отвалился целиком) и худшей реальной долей:
# ЦУМ 11611/15204 = 76.4%, ElytS 9/39 = 23.1%. То есть запас ×2.3 от худшего
# наблюдаемого и всё ещё недостижимо для прогона, где джойн не сработал вовсе.
# monobrand сюда НЕ засчитывается: у обязательного магазина его и быть не может
# (required_feed_sources исключает монобрендовые), а засчитывать константу как
# «сказал мерчант» — это подмена, с которой всё и началось.
MIN_FEED_VENDOR_SHARE = 0.10


# ---------------------------------------------------------------------------
# Чистая часть: разбор фида и построение плана. Ни сети, ни базы.
# ---------------------------------------------------------------------------

# Тип ключа проходит в индекс, только если он ведёт себя как ИДЕНТИФИКАТОР.
# Два признака, оба меряются на самом фиде:
#
#   cardinality = сколько РАЗНЫХ значений тип принимает на офферах, где он есть.
#       Идентификатор почти уникален; перечисление (цвет, размер, сезон) — нет.
#   ambiguity  = доля значений, под которыми стоит больше одной марки.
#       У идентификатора таких нет; у перечисления их большинство.
#
# Замерено на живых фидах 2026-08-20 (backend/scripts, probe в задаче):
#
#   фид    тип ключа   значений/офферов        cardinality  ambiguity
#   ЦУМ    id            8964 / 8964              1.0000        0.0%
#   ElytS  id           81616 / 81616             1.0000        0.0%
#   ElytS  vendorCode   28514 / 81616             0.3494        0.0%   (варианты
#                                                 одной модели делят код)
#   ElytS  model            25 / 81580            0.0003       76.0%   ← ЦВЕТА
#
# У ElytS <model> — это цвет: 25 значений на 81616 офферов, все до одного
# названия цветов. Шесть цветов случайно оказались уникальными по марке
# («Светло-серый» → AZUR, «Сиреневый» → ANNA RACHELE), и по ним в проде
# джойнятся 9 строк ElytS, чей SKU в notes — тоже цвет. Проверка «ключ ведёт к
# одной марке» этого не ловит: она смотрит на ключ, а не на тип ключа. И
# предохранитель по двум сигналам тоже не ловит — название заканчивается той же
# маркой, сигналы совпадают, и совпадение не отвергается, а подтверждается.
# Результат — brand_source='feed_vendor', то есть «это сказал мерчант», на
# джойне по слову «Светло-серый». Такие строки должны получать бренд из
# названия и метку dictionary — что и происходит после отсечки.
MIN_KEY_CARDINALITY = 0.05   # ElytS vendorCode = 0.349 проходит с запасом ×7
MAX_KEY_AMBIGUITY = 0.20     # ElytS model = 0.76 не проходит


def index_feed(xml_bytes) -> tuple:
    """(sku -> vendor, [все vendor фида], сколько ключей отброшено) для фида.

    Индекс многоключевой: id-атрибут (так пишет ЦУМ, у которого нет <model>),
    <vendorCode> и <model>. Импортёры за годы выбирали SKU по-разному
    (`model or id`, `id or group_id`), и в notes лежит смесь.

    group_id НЕ индексируется, хотя lib_feed_parser его умеет писать. Замер на
    живом фиде ЦУМа 2026-08-20: с ним джойнится 11640 строк вместо 11611, и 25
    из этих 29 лишних оказываются чужой маркой — group_id объединяет варианты и
    свободно совпадает с чужим id. 29 строк не стоят 25 неверных марок.

    Ключи разобраны ПО ТИПАМ и в порядке надёжности: коллизия между типами
    (чей-то id совпал с чужим vendorCode) не должна выбрасывать честный id-ключ.

    ЦЕЛИКОМ тип ключа выбрасывается, если он не похож на идентификатор — см.
    MIN_KEY_CARDINALITY / MAX_KEY_AMBIGUITY выше. Отдельно от этого внутри
    выжившего типа выбрасывается конкретный ключ, указывающий на РАЗНЫЕ марки.

    Возвращает ещё и `rejected` — какие типы ключей не прошли отсечку, чтобы это
    было видно в логе прогона, а не только в коде.
    """
    root = ET.fromstring(xml_bytes)
    shop = root.find("shop")
    if shop is None:
        return {}, [], 0, {}

    key_types = ("id", "vendorCode", "model")
    candidates = {t: collections.defaultdict(set) for t in key_types}
    present = collections.Counter()
    vendors = []
    for offer in shop.findall(".//offer"):
        vendor = (offer.findtext("vendor") or "").strip()
        vendors.append(vendor)
        if not vendor:
            continue
        raw = {
            "id": offer.get("id"),
            "vendorCode": offer.findtext("vendorCode"),
            "model": offer.findtext("model"),
        }
        for t in key_types:
            key = (raw[t] or "").strip()
            if key:
                present[t] += 1
                candidates[t][key].add(vendor)

    index, dropped, rejected = {}, set(), {}
    for t in key_types:
        seen = candidates[t]
        if not seen:
            continue
        cardinality = len(seen) / present[t]
        ambiguous = sum(1 for found in seen.values() if len(found) > 1)
        ambiguity = ambiguous / len(seen)
        if cardinality < MIN_KEY_CARDINALITY or ambiguity > MAX_KEY_AMBIGUITY:
            # Не идентификатор, а перечисление. Джойн по нему дал бы марку по
            # совпадению строк, а метку поставил бы «так сказал мерчант».
            rejected[t] = (
                f"значений {len(seen)} на {present[t]} офферов "
                f"(cardinality {cardinality:.4f}, неоднозначных {100 * ambiguity:.1f}%)"
            )
            continue
        for key, found in seen.items():
            if len(found) == 1:
                index.setdefault(key, next(iter(found)))
            else:
                dropped.add(key)
    return index, vendors, len(dropped - set(index)), rejected


def plan_updates(rows, feed_index_by_source, dictionary_by_source, upgrade=False,
                 conflicts=None):
    """[(id, brand, brand_source)] — что скрипт записал бы.

    rows: последовательность мэппингов с id, notes, item_name, brand, brand_source.
    Порядок решений — порядок доверия: фид, потом монобренд-константа, потом
    словарь. Ничего иного не придумывается: если все три молчат, строка
    остаётся NULL.

    Предохранитель: если джойн по SKU и суффикс из названия называют РАЗНЫЕ дома
    — строка остаётся NULL, а не «побеждает» кто-то из двоих. Два независимых
    сигнала разошлись, значит мы не знаем; марка в партнёрском отчёте не место
    для угадывания. На текущем каталоге предохранитель не срабатывает ни разу
    (замер 2026-08-20: 11611 сджойненных строк ЦУМа, 0 расхождений) — он стоит
    на случай, когда мерчант переиспользует SKU. `conflicts` — необязательный
    список, куда складываются такие строки для отчёта.
    """
    updates = []
    for row in rows:
        current = (row.get("brand") or "").strip()
        if current and not (upgrade and row.get("brand_source") == BRAND_SOURCE_DICTIONARY):
            # Уже заполнено настоящим значением — не трогаем. Скрипт
            # идемпотентен: второй прогон не переписывает первый.
            continue

        retailer = retailer_from_notes(row.get("notes"))
        sku = (row.get("notes") or "").split(":", 1)[1].strip() if ":" in (row.get("notes") or "") else ""

        # Словарь только своего магазина: марку, которую этот магазин не
        # продаёт, ему приписывать нельзя.
        guess = match_brand_suffix(
            row.get("item_name") or "", dictionary_by_source.get(retailer, {})
        )

        brand = brand_source = None
        vendor = feed_index_by_source.get(retailer, {}).get(sku) if sku else None
        if vendor:
            if guess and normalize_brand(guess) != normalize_brand(vendor):
                if conflicts is not None:
                    conflicts.append((row["id"], vendor, guess, row.get("item_name")))
                continue
            brand, brand_source = vendor, BRAND_SOURCE_FEED_VENDOR
        elif monobrand_for_source(retailer or ""):
            brand, brand_source = monobrand_for_source(retailer), BRAND_SOURCE_MONOBRAND
        elif guess:
            brand, brand_source = guess, BRAND_SOURCE_DICTIONARY

        if not brand:
            continue
        if brand == current and row.get("brand_source") == brand_source:
            continue
        updates.append((row["id"], brand, brand_source))
    return updates


def required_feed_sources(rows, feed_keys):
    """Магазины, без чьего фида их строки НЕ МОГУТ получить бренд.

    Три условия сразу: у магазина есть зарегистрированный фид (ключ
    ADMITAD_FEEDS), в базе есть его строки, и монобренд-константы у него нет.
    На текущем каталоге это ровно {ЦУМ, ElytS} — те 14889 строк, ради которых
    скрипт и написан.

    Кто сюда НЕ попадает и почему это правильно:
      SELA, 2moodstore     монобрендовые: константа заполнит их и без фида;
      Lacoste, LOVE REPUBLIC  тоже монобрендовые, и ключа в ADMITAD_FEEDS у них
                           нет вовсе (импортированы руками);
      Эконика              фид зарегистрирован, но `import: False` — строк в
                           базе нет, значит и требовать его нечего;
      Unknown (gate31)     фида не существует; его 1250 строк остаются NULL
                           осознанно, и требовать тут нечего.

    То есть падать прогон будет только там, где падение = потерянная работа.
    """
    needed = set()
    for row in rows:
        retailer = retailer_from_notes(row.get("notes"))
        if not retailer or retailer not in feed_keys:
            continue
        if monobrand_for_source(retailer):
            continue
        needed.add(retailer)
    return needed


def check_coverage(rows, updates, sources, floor=MIN_SOURCE_COVERAGE,
                   vendor_floor=MIN_FEED_VENDOR_SHARE):
    """[(магазин, с маркой, всего, доля, из фида, доля из фида, ok)] по магазинам.

    Считает по ИТОГОВОМУ состоянию: уже стоявшая марка плюс та, что поставил бы
    этот прогон. Именно эта проверка отличает «фид отдал 200 OK и HTML-заглушку»
    от «фид отработал»: исключения в первом случае может не быть вовсе, а строк
    с маркой — ноль.

    ДВА порога, потому что они ловят разное:

      доля с маркой (floor)         работа вообще была сделана;
      доля feed_vendor (vendor_floor)  её сделал ДЖОЙН ПО SKU, а не словарь.

    Второй появился потому, что первый слеп к происхождению значения. Словарь
    строится из <vendor> ТОГО ЖЕ фида и отвечает на 90–99% строк без всякого
    джойна, так что развалившийся джойн даёт по первому порогу 97.4% у ЦУМа —
    выше 90%. См. MIN_FEED_VENDOR_SHARE: там замеры и цена ошибки.

    Магазин без строк в выборке считается пройденным (0 из 0): требовать долю от
    пустого множества нельзя, а вот молча делить на ноль — тем более.
    """
    planned = {u[0]: u[2] for u in updates}
    total = collections.Counter()
    filled = collections.Counter()
    stated = collections.Counter()
    for row in rows:
        retailer = retailer_from_notes(row.get("notes"))
        if retailer not in sources:
            continue
        total[retailer] += 1
        # Что будет в базе ПОСЛЕ прогона: запланированное значение важнее
        # текущего (при --upgrade строка со словарной маркой переписывается).
        final = planned.get(row["id"])
        if final is None and (row.get("brand") or "").strip():
            # Марка стоит, а происхождение неизвестно (строки старше миграции
            # 030). Это «заполнено», но не «сказал мерчант».
            final = (row.get("brand_source") or "").strip() or "unknown"
        if not final:
            continue
        filled[retailer] += 1
        if final == BRAND_SOURCE_FEED_VENDOR:
            stated[retailer] += 1

    report = []
    for retailer in sorted(sources):
        n = total[retailer]
        got = filled[retailer]
        from_feed = stated[retailer]
        share = (got / n) if n else 1.0
        vendor_share = (from_feed / n) if n else 1.0
        ok = share >= floor and vendor_share >= vendor_floor
        report.append((retailer, got, n, share, from_feed, vendor_share, ok))
    return report


def render_plan(rows, updates, conflicts=None) -> str:
    """Текст плана: по магазинам, сколько и откуда, плюс примеры."""
    by_id = {r["id"]: r for r in rows}
    per_source = collections.defaultdict(lambda: collections.Counter())
    brands_per_source = collections.defaultdict(set)
    examples = collections.defaultdict(list)

    for row in rows:
        per_source[retailer_from_notes(row.get("notes")) or "(нет notes)"]["строк"] += 1
    for item_id, brand, source in updates:
        retailer = retailer_from_notes(by_id[item_id].get("notes")) or "(нет notes)"
        per_source[retailer][source] += 1
        brands_per_source[retailer].add(brand)
        if len(examples[source]) < 6:
            examples[source].append((retailer, brand, by_id[item_id].get("item_name") or ""))

    head = f"{'магазин':<28}{'строк':>7}{'feed_vendor':>13}{'monobrand':>11}{'dictionary':>12}{'останется NULL':>16}{'марок':>8}"
    lines = [head, "-" * len(head)]
    totals = collections.Counter()
    for retailer in sorted(per_source, key=lambda s: -per_source[s]["строк"]):
        c = per_source[retailer]
        filled = c[BRAND_SOURCE_FEED_VENDOR] + c[BRAND_SOURCE_MONOBRAND] + c[BRAND_SOURCE_DICTIONARY]
        already = sum(
            1 for r in rows
            if (retailer_from_notes(r.get("notes")) or "(нет notes)") == retailer and (r.get("brand") or "").strip()
        )
        left = c["строк"] - filled - already
        lines.append(
            f"{retailer:<28}{c['строк']:>7}{c[BRAND_SOURCE_FEED_VENDOR]:>13}"
            f"{c[BRAND_SOURCE_MONOBRAND]:>11}{c[BRAND_SOURCE_DICTIONARY]:>12}{left:>16}"
            f"{len(brands_per_source[retailer]):>8}"
        )
        for k, v in c.items():
            totals[k] += v
        totals["останется NULL"] += left
    lines.append("-" * len(head))
    lines.append(
        f"{'ИТОГО':<28}{totals['строк']:>7}{totals[BRAND_SOURCE_FEED_VENDOR]:>13}"
        f"{totals[BRAND_SOURCE_MONOBRAND]:>11}{totals[BRAND_SOURCE_DICTIONARY]:>12}"
        f"{totals['останется NULL']:>16}"
    )

    for source in (BRAND_SOURCE_FEED_VENDOR, BRAND_SOURCE_MONOBRAND, BRAND_SOURCE_DICTIONARY):
        if not examples[source]:
            continue
        lines.append("")
        lines.append(f"примеры {source}:")
        for retailer, brand, name in examples[source]:
            lines.append(f"  {retailer:<24} {brand:<32} {name[:56]}")

    if conflicts:
        lines.append("")
        lines.append(
            f"конфликтов фид-vs-название: {len(conflicts)} — эти строки остаются NULL "
            f"(два сигнала назвали разные дома, значит мы не знаем):"
        )
        for _id, vendor, guess, name in conflicts[:10]:
            lines.append(f"  фид={vendor:<26} название={guess:<26} {(name or '')[:44]}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Сеть и база
# ---------------------------------------------------------------------------

async def fetch_feeds(sources):
    """(индексы, словари, {магазин: почему не вышло}) — качает фиды.

    Третье значение — не украшение лога. Раньше исключение печаталось в stderr
    и прогон продолжался как ни в чём не бывало; вызывающему не оставалось
    ничего, по чему можно отличить «фида нет» от «фид пуст по делу», и main()
    возвращал 0. Теперь причина возвращается наверх, и main() решает, была ли
    эта неудача фатальной (см. required_feed_sources).

    Пустой разбор — тоже неудача. Фид, отдавший 200 OK и 0 офферов (заглушка
    провайдера, сменившийся формат), исключения не бросает, а работы не даёт.

    И пустой ИНДЕКС — тоже. index_feed уже считает, какие типы ключей не похожи
    на идентификатор (`rejected`), но раньше это только печаталось в stderr и
    ни на что не влияло. Фид, у которого отсечку не прошёл НИ ОДИН тип ключа,
    джойнить не по чему: все строки уйдут в словарь, каждая получит метку
    «мы догадались», а прогон отрапортует успех — словарь-то отвечает.
    Такой фид объявляется неудачей здесь, и для обязательного магазина это
    сразу код возврата 1 (см. _verdict).
    """
    import httpx
    # Импорт внутри функции: ADMITAD_FEEDS тянет за собой settings, а чистая
    # часть скрипта (и её самопроверка) должна импортироваться без окружения.
    from app.api.cron import ADMITAD_FEEDS

    feed_index, dictionaries, failures = {}, {}, {}
    async with httpx.AsyncClient(timeout=FEED_TIMEOUT, follow_redirects=True) as client:
        for name, cfg in ADMITAD_FEEDS.items():
            if sources and name not in sources:
                continue
            try:
                resp = await client.get(cfg["url"])
                resp.raise_for_status()
                index, vendors, dropped, rejected = index_feed(resp.content)
            except Exception as e:
                failures[name] = f"{type(e).__name__}: {e}"
                print(f"[warn] фид {name} не скачался/не разобрался: {e}", file=sys.stderr)
                continue
            if not vendors:
                failures[name] = "фид разобрался, но в нём 0 офферов"
                print(f"[warn] фид {name}: 0 офферов — считаем неудачей, "
                      f"а не пустым каталогом", file=sys.stderr)
                continue
            if not index:
                why = "; ".join(f"<{t}> — {w}" for t, w in rejected.items()) or "ключей нет вовсе"
                failures[name] = f"ни один тип ключа не годится для джойна: {why}"
                print(f"[warn] фид {name}: джойнить не по чему ({why}). Марку "
                      f"дал бы только словарь, то есть догадка с меткой "
                      f"«сказал мерчант» — считаем неудачей.", file=sys.stderr)
                continue
            named = sum(1 for v in vendors if v)
            feed_index[name] = index
            dictionaries[name] = build_brand_dictionary(vendors)
            print(
                f"[фид] {name}: офферов {len(vendors)}, с <vendor> {named}, "
                f"ключей SKU {len(index)} (неоднозначных отброшено {dropped}), "
                f"марок в словаре {len(dictionaries[name])}",
                file=sys.stderr,
            )
            for key_type, why in rejected.items():
                # Видно в логе прогона: по этому тегу джойна не будет, и почему.
                print(f"[фид] {name}: тег <{key_type}> не идентификатор — {why}; "
                      f"по нему не джойним", file=sys.stderr)
    return feed_index, dictionaries, failures


def _verdict(rows, updates, required, feed_failures, limit) -> int:
    """Печатает итог и возвращает код возврата: 0 — сделано, 1 — не сделано.

    Три независимых основания для единицы, потому что они ловят разное:
      1) обязательный фид не скачался (или скачался, но джойнить в нём не по
         чему — все типы ключей провалили отсечку) — это видно по feed_failures;
      2) у обязательного магазина доля строк с маркой ниже MIN_SOURCE_COVERAGE —
         исключения не было, а работы нет;
      3) доля строк, чью марку назвал мерчант, ниже MIN_FEED_VENDOR_SHARE —
         исключения не было, работа есть, но её сделал СЛОВАРЬ. Этот случай
         проходил как успех даже с проверкой (2): словарь берётся из того же
         фида и закрывает ЦУМ на 97.4% вообще без единого джойна.

    Доля считается ПО МАГАЗИНУ, а не по каталогу, и это сознательный выбор в
    сторону шума: если фид ElytS (39 строк) умрёт навсегда, отметка не встанет
    и прогон будет повторяться каждый деплой, хотя 15204 строки ЦУМа уже
    залиты. Общая доля 99.7% такой отказ бы спрятала — а прятать его нельзя,
    именно из спрятанного «в целом всё хорошо» вырос исходный баг. Прогон при
    этом дешевеет сам: заполненные строки в план больше не попадают.
    """
    bad_feeds = sorted(required & set(feed_failures))
    for name in sorted(set(feed_failures) - set(bad_feeds)):
        # Фид не скачался, но его строки закрывает монобренд-константа (или его
        # строк нет вовсе) — это не повод валить прогон.
        print(f"[инфо] фид {name} не отработал ({feed_failures[name]}), но его строки "
              f"бренд получают не из фида — прогон это не ломает", file=sys.stderr)

    if limit:
        # --limit режет выборку произвольно; доля по обрезку ничего не значит.
        print("\n[проверка] --limit задан — проверка полноты пропущена.")
        return 1 if bad_feeds else 0

    report = check_coverage(rows, updates, required)
    print("\n[проверка] полнота по магазинам, без чьего фида марки не будет:")
    print(f"  {'магазин':<28} {'с маркой':>13}  {'из них назвал мерчант':>26}")
    if not report:
        print("  (таких магазинов в выборке нет)")
    for retailer, got, total, share, from_feed, vendor_share, ok in report:
        print(f"  {retailer:<28} {got:>6}/{total:<6} {100 * share:5.1f}%  "
              f"{from_feed:>6}/{total:<6} {100 * vendor_share:5.1f}%  "
              f"{'ок' if ok else 'НИЖЕ ПОРОГА'}")

    thin = [r for r in report if not r[6]]
    if not bad_feeds and not thin:
        return 0
    for name in bad_feeds:
        print(f"[ошибка] обязательный фид {name} не отработал: {feed_failures[name]}",
              file=sys.stderr)
    for retailer, got, total, share, from_feed, vendor_share, _ in thin:
        if share < MIN_SOURCE_COVERAGE:
            print(f"[ошибка] {retailer}: марка есть у {got} из {total} ({100 * share:.1f}%), "
                  f"это ниже порога {100 * MIN_SOURCE_COVERAGE:.0f}%", file=sys.stderr)
        if vendor_share < MIN_FEED_VENDOR_SHARE:
            print(f"[ошибка] {retailer}: марку назвал мерчант только у {from_feed} из "
                  f"{total} ({100 * vendor_share:.1f}%), это ниже порога "
                  f"{100 * MIN_FEED_VENDOR_SHARE:.0f}% — джойн по SKU не сработал, "
                  f"остальное угадал словарь и пометил бы как догадку навсегда",
                  file=sys.stderr)
    print("[ошибка] работа сделана не полностью — отметка о применении НЕ ставится, "
          "прогон повторится на следующем деплое.", file=sys.stderr)
    return 1


async def main(commit: bool, sources, upgrade: bool, limit):
    """Код возврата: 0 — работа сделана, 1 — сделана не вся (см. модульный docstring)."""
    from sqlalchemy import text as sql
    from app.core.database import async_session
    from app.api.cron import ADMITAD_FEEDS

    where = "notes IS NOT NULL"
    binds = {}
    if sources:
        where += " AND split_part(notes, ':', 1) = ANY(:sources)"
        binds["sources"] = list(sources)
    query = f"""
        SELECT id, notes, item_name, brand, brand_source
        FROM wardrobe_items
        WHERE {where}
        ORDER BY id
    """
    if limit:
        query += f" LIMIT {int(limit)}"

    async with async_session() as db:
        rows = [dict(r) for r in (await db.execute(sql(query), binds)).mappings().all()]

    # Строки читаются ДО фидов: какие фиды обязательны, видно только по тому, чьи
    # строки лежат в базе. Заодно не приходится держать список «важных» магазинов
    # рядом со списком фидов — он бы разошёлся.
    required = required_feed_sources(rows, set(ADMITAD_FEEDS))
    feed_index, dictionaries, feed_failures = await fetch_feeds(sources)

    conflicts = []
    updates = plan_updates(rows, feed_index, dictionaries, upgrade=upgrade,
                           conflicts=conflicts)
    print(render_plan(rows, updates, conflicts))

    if not commit:
        print(f"\n[dry-run] прочитано строк {len(rows)}, изменилось бы {len(updates)}, "
              f"конфликтов {len(conflicts)}. "
              f"Ничего не записано — для записи нужен --commit.")
        return _verdict(rows, updates, required, feed_failures, limit)

    async with async_session() as db:
        for i in range(0, len(updates), 500):
            chunk = updates[i:i + 500]
            await db.execute(
                sql("""
                    UPDATE wardrobe_items AS w
                       SET brand = v.brand, brand_source = v.brand_source
                      FROM (SELECT unnest(CAST(:ids AS bigint[])) AS id,
                                   unnest(CAST(:brands AS text[])) AS brand,
                                   unnest(CAST(:srcs AS text[])) AS brand_source) AS v
                     WHERE w.id = v.id
                """),
                {
                    "ids": [u[0] for u in chunk],
                    "brands": [u[1] for u in chunk],
                    "srcs": [u[2] for u in chunk],
                },
            )
            await db.commit()
            print(f"[записано] {min(i + 500, len(updates))}/{len(updates)}", file=sys.stderr)
    print(f"\n[commit] обновлено строк: {len(updates)}")
    # Проверка ПОСЛЕ записи, и записанное не откатывается: магазины независимы,
    # прогон идемпотентен. Упавший ElytS не повод оставить ЦУМ без марок — он
    # повод не ставить отметку «применено» и добрать остаток следующим деплоем.
    return _verdict(rows, updates, required, feed_failures, limit)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--commit", action="store_true",
                   help="применить план (по умолчанию только печатает)")
    p.add_argument("--source", action="append", dest="sources", default=None,
                   help="ограничить одним магазином (ключ ADMITAD_FEEDS), можно повторять")
    p.add_argument("--upgrade", action="store_true",
                   help="перезаписать значения с brand_source='dictionary', если фид "
                        "теперь называет марку сам; feed_vendor/monobrand не трогает")
    p.add_argument("--limit", type=int, default=None, help="ограничить число строк (отладка)")
    args = p.parse_args()
    # Код возврата прокидывается наружу намеренно: на нём стоит отметка
    # «применено» в scripts/backfill.sh, и молчаливый 0 стоил бы 62% каталога.
    sys.exit(asyncio.run(main(args.commit, set(args.sources or []), args.upgrade, args.limit)))
