# -*- coding: utf-8 -*-
"""Лукбук: собранный образ -> одна фотография ИИ-модели в этих вещах.

Зачем. Витрина «кружки по странам» (outfits.vibe, миграция 024) наполняется
образами из каталога, но превью у карточки было `image_url` первой вещи — то
есть карточка выглядела как товар, а не как лук. Здесь вещи образа
отправляются в Gemini (google/gemini-3.1-flash-image-preview, тот же движок,
что у примерочной в misc.py) как референсы, и на выходе один вертикальный кадр
модели в этом образе.

Почему один вызов на образ, а не примерочная по вещам. Примерочная (`/api/vton`)
надевает вещи на аватар последовательно — это N вызовов на образ. Здесь важна
цена: кадр стоит денег, а образов десятки, поэтому весь лук генерируется одним
запросом с несколькими референсными картинками.

Чистая часть (сборка промпта) тестируется без сети:
    PYTHONPATH=backend python3 backend/app/services/lookbook.py
"""

import asyncio
import base64

import httpx

# Замер 2026-08-17: один кадр 3:4 стоил $0.0686 (1120 image-токенов по $0.00006
# плюс промпт). Используется как оценка, когда фактическую цену прочитать не
# удалось — сторож бюджета должен ошибаться в сторону перерасхода бюджета
# ВНИЗ, то есть считать неизвестный кадр платным, а не бесплатным.
FALLBACK_COST_USD = 0.069

# Папка в S3 — она же признак «превью уже сгенерировано» для админского батча.
S3_FOLDER = "lookbook"

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
# Вертикальный кадр: лента идей листается как сторис, 3:4 совпадает с примерочной.
ASPECT_RATIO = "3:4"
# max_tokens обязателен: OpenRouter резервирует запрошенный максимум заранее и
# отдаёт 402 при дефолтных ~65535, даже когда бюджета на нормальный ответ хватает.
MAX_TOKENS = 4096

# «Болванчики» — нейтральные модели, по несколько на пол, чтобы витрина не
# выглядела каталогом одного человека. Выбор детерминированный (по id образа),
# поэтому повторный прогон даёт тот же типаж, а не новую лотерею.
MODELS: dict[str, list[str]] = {
    "female": [
        "a woman in her mid-20s, medium-length dark hair, calm neutral expression",
        "a woman in her early 30s, short blonde hair, relaxed posture",
        "a woman in her late 20s, long wavy auburn hair, natural stance",
    ],
    "male": [
        "a man in his late 20s, short dark hair, clean-shaven, calm expression",
        "a man in his mid-30s, light brown hair, short beard, relaxed posture",
        "a man in his early 30s, buzz cut, neutral expression",
    ],
}

# Фон под кружок. Ключ отсутствует -> нейтральная студия: лучше пресно, чем
# выдумать «японскую улицу» и получить открытку вместо лука.
_BACKDROPS: dict[str, str] = {
    "Япония": "a clean minimal interior with warm off-white walls and soft daylight",
    "Франция": "a quiet Parisian street in soft overcast daylight",
    "Италия": "a sunlit stone building facade, warm late-afternoon light",
    "Америка": "a plain concrete wall in flat neutral daylight",
    "Корея": "a bright airy studio with pale pastel walls",
    "Скандинавия": "a bare white studio with cool even light",
}
_DEFAULT_BACKDROP = "a seamless light grey studio backdrop with soft even light"


def pick_model(gender: str | None, seed: int) -> str:
    """Типаж модели: детерминированно по id образа, чтобы прогоны совпадали."""
    variants = MODELS.get((gender or "").strip().lower()) or MODELS["female"]
    return variants[seed % len(variants)]


def build_prompt(vibe: str | None, gender: str | None, items: list[dict], seed: int) -> str:
    """Промпт для кадра. Чистая функция — покрыта селфчеком внизу файла.

    Вещи перечисляются текстом И передаются картинками: только текста моделью
    мало (она додумывает фасон), только картинок — мало тоже (она путает,
    сколько предметов надеть и что из них верх).
    """
    garments = []
    for i, it in enumerate(items, 1):
        parts = [p for p in (it.get("name"), it.get("color"), it.get("clothing_type")) if p]
        garments.append(f"{i}. {' — '.join(str(p) for p in parts)}")
    listing = "\n".join(garments)
    backdrop = _BACKDROPS.get((vibe or "").strip()) or _DEFAULT_BACKDROP

    return (
        f"Photorealistic full-body fashion photograph of {pick_model(gender, seed)}, "
        f"standing against {backdrop}.\n\n"
        f"The person wears EXACTLY these {len(items)} garments, each shown in the "
        f"reference images in the same order:\n{listing}\n\n"
        "STRICT RULES:\n"
        "- Reproduce each garment faithfully: same colour, same fabric, same cut, "
        "same details as its reference image. Do NOT restyle or recolour.\n"
        f"- Exactly {len(items)} garments on the person. Do NOT add any clothing "
        "that is not in the list — no extra jacket, no extra layer, no added "
        "accessories, no bag, no hat, no jewellery.\n"
        "- One single person, whole body visible from head to feet, face visible, "
        "both feet inside the frame.\n"
        "- Natural anatomy and proportions. Hands and feet fully formed.\n"
        "- One single photograph. NOT a collage, NOT a grid, NOT a split frame, "
        "NOT a mirror. No duplicated person.\n"
        "- No text, no captions, no logos, no watermarks, no brand names anywhere.\n"
        "- Editorial lookbook photography, soft natural light, muted colour grading."
    )


async def _as_data_uri(client: httpx.AsyncClient, url: str) -> dict | None:
    """Скачать картинку вещи и завернуть в data-uri для OpenRouter."""
    try:
        resp = await client.get(url, timeout=20.0)
        if resp.status_code != 200 or not resp.content:
            return None
        ct = resp.headers.get("content-type", "image/jpeg").split(";")[0]
        b64 = base64.b64encode(resp.content).decode()
        return {"type": "image_url", "image_url": {"url": f"data:{ct};base64,{b64}"}}
    except Exception:
        return None


async def generate(chat, vibe: str | None, gender: str | None, items: list[dict],
                   seed: int) -> tuple[str | None, str | None]:
    """Один кадр на образ. Возвращает (data-uri картинки, id генерации OpenRouter).

    id нужен, чтобы прочитать фактическую стоимость через /api/v1/generation —
    в прайсе OpenRouter поле output_image неоднозначно по единицам, поэтому цену
    мы не угадываем, а измеряем.

    `chat` — инъекция вызывающего (misc._openrouter_chat), чтобы модуль не тянул
    за собой FastAPI и оставался тестируемым.
    """
    async with httpx.AsyncClient() as client:
        refs = [r for r in [await _as_data_uri(client, it["image_url"])
                            for it in items if it.get("image_url")] if r]
    if not refs:
        return None, None

    content = [{"type": "text", "text": build_prompt(vibe, gender, items, seed)}] + refs
    result = await chat(
        messages=[{"role": "user", "content": content}],
        model=IMAGE_MODEL,
        temperature=0.6,
        modalities=["image", "text"],
        image_config={"aspect_ratio": ASPECT_RATIO},
        max_tokens=MAX_TOKENS,
    )
    images = result.get("choices", [{}])[0].get("message", {}).get("images", [])
    if not images:
        return None, result.get("id")
    return images[0].get("image_url", {}).get("url") or None, result.get("id")


async def fetch_cost(api_key: str, generation_id: str, attempts: int = 4) -> float | None:
    """Фактическая стоимость генерации по её id, с ретраями.

    Ретраи обязательны: статистика у OpenRouter появляется НЕ сразу — запрос
    сразу после генерации отдаёт не-200, и первый замер (2026-08-17) вернул
    None, хотя через несколько секунд по тому же id пришло total_cost 0.0686.
    Без ретраев сторож бюджета видел бы None на каждом кадре, не накапливал
    трату и не остановился бы никогда — то есть охранял бы бюджет только на вид.
    """
    if not generation_id:
        return None
    for i in range(attempts):
        if i:
            await asyncio.sleep(2 * i)                # 0, 2, 4, 6 c
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    "https://openrouter.ai/api/v1/generation",
                    params={"id": generation_id},
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    return resp.json().get("data", {}).get("total_cost")
        except Exception:
            pass
    return None


if __name__ == "__main__":
    items = [
        {"name": "Рубашка оверсайз", "color": "бежевый", "clothing_type": "shirt",
         "image_url": "http://x/1.jpg"},
        {"name": "Брюки широкие", "color": "серый", "clothing_type": "pants",
         "image_url": "http://x/2.jpg"},
        {"name": "Лоферы", "color": "коричневый", "clothing_type": "shoes",
         "image_url": "http://x/3.jpg"},
    ]
    p = build_prompt("Япония", "female", items, seed=0)
    assert "EXACTLY these 3 garments" in p, p
    assert "Рубашка оверсайз — бежевый — shirt" in p, p
    assert "warm off-white walls" in p, p            # фон кружка подставился
    assert MODELS["female"][0] in p, p

    # Мужской типаж и ротация по seed.
    assert MODELS["male"][1] in build_prompt("Италия", "male", items, seed=4)
    assert pick_model("male", 0) != pick_model("male", 1)
    assert pick_model("male", 3) == pick_model("male", 0), "ротация должна быть стабильной"

    # Неизвестный кружок и пустой пол не роняют промпт.
    d = build_prompt("Марс", None, items, seed=0)
    assert _DEFAULT_BACKDROP in d, d
    assert MODELS["female"][0] in d, "без пола берём женский типаж по умолчанию"

    # Число вещей в тексте всегда совпадает со списком — иначе модель добавляет своё.
    two = build_prompt(None, "female", items[:2], seed=0)
    assert "EXACTLY these 2 garments" in two and "Exactly 2 garments" in two, two

    # Запреты, без которых модель клеит коллажи и лепит логотипы.
    for must in ("NOT a collage", "no logos", "both feet inside the frame"):
        assert must in p, must

    print("lookbook self-check OK")
