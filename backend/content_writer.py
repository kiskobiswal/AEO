"""Content Writer — generate SEO/AEO-optimized content with heuristic scoring.

Design goals:
  * Minimal LLM credit usage: ONE call to a small/cheap model (gpt-4o-mini)
    generates the full markdown article. Scores are computed deterministically
    in Python (no additional LLM calls for scoring).
  * Returns:
      - `content` (markdown string)
      - `title`, `meta_description`
      - `scores` — {seo, aeo, readability, overall} 0-100
      - `breakdown` — sub-metrics for the right-side panel
      - `suggestions` — actionable tips (rule-based)
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger("content_writer")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

content_writer_router = APIRouter(prefix="/api/content-writer", tags=["content-writer"])


# ---------- Schemas ----------
class GenerateInput(BaseModel):
    topic: str = Field(..., min_length=2, max_length=300)
    keywords: List[str] = Field(default_factory=list)
    prompt: Optional[str] = Field(default=None, max_length=1500)
    tone: Optional[str] = Field(default="professional")
    length: Optional[str] = Field(default="medium")  # short | medium | long


class ScoreBreakdown(BaseModel):
    label: str
    value: float
    max: float = 100
    detail: Optional[str] = None
    passed: Optional[bool] = None


class GenerateResponse(BaseModel):
    id: str
    title: str
    meta_description: str
    content: str
    word_count: int
    scores: dict
    breakdown: dict
    suggestions: List[str]


# ---------- Prompt & LLM ----------
def _length_to_words(length: str) -> str:
    return {
        "short": "400-600 words",
        "medium": "800-1100 words",
        "long": "1400-1800 words",
    }.get((length or "medium").lower(), "800-1100 words")


def _build_prompt(inp: GenerateInput) -> str:
    kws = ", ".join([k.strip() for k in inp.keywords if k and k.strip()]) or "(infer from topic)"
    extra = (inp.prompt or "").strip()
    words = _length_to_words(inp.length or "medium")
    tone = (inp.tone or "professional").strip()

    return f"""You are an expert SEO + AEO (Answer Engine Optimization) copywriter.
Write a {words} article on the topic below optimized for BOTH classic SEO and generative AI answer engines (ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude).

TOPIC: {inp.topic}
PRIMARY KEYWORDS: {kws}
TONE: {tone}
{f"ADDITIONAL INSTRUCTIONS: {extra}" if extra else ""}

STRICT OUTPUT FORMAT (markdown only, no code fences, no commentary):
1. First line: `# <Title including primary keyword, 50-65 chars>`
2. Second line: `META: <compelling 140-160 char meta description with primary keyword>`
3. Third line: `TL;DR: <one-sentence 25-40 word direct quotable answer to the topic question>`
4. Then the article body with these mandatory elements:
   - 3-6 `##` H2 sections (each begins with a scannable heading, ideally phrased as a question when natural)
   - Short paragraphs (2-4 sentences each)
   - At least one bulleted list and one numbered list
   - A `## Frequently Asked Questions` section with 3-5 Q&A pairs (each question as `### Q: ...` followed by a 2-3 sentence direct answer starting with the answer)
   - A final `## Key Takeaways` bulleted list (3-5 bullets)

RULES:
- Use each primary keyword at least twice but avoid stuffing.
- Prefer direct, factual answer sentences at the start of each section.
- No fluff, no "in this article we will discuss..." intros. Start with a substantive first sentence.
- Do NOT invent statistics or citations. Speak generally when facts are unknown.
"""


async def _generate_content_llm(inp: GenerateInput) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    system = "You are a precise SEO/AEO copywriter. Output ONLY the markdown article per the instructions."
    session = f"content-writer-{uuid.uuid4()}"
    # Use cheap fast model (gpt-4o-mini) to minimise credit usage.
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session, system_message=system)
        .with_model("openai", "gpt-4o-mini")
        .with_params(max_tokens=2200)
    )
    try:
        resp = await asyncio.wait_for(
            chat.send_message(UserMessage(text=_build_prompt(inp))),
            timeout=75,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Content generation timed out. Please retry.")
    except Exception as e:
        logger.warning(f"content-writer LLM error: {e}")
        raise HTTPException(status_code=502, detail="AI is temporarily unavailable. Please retry.")
    text = resp if isinstance(resp, str) else str(resp)
    return text.strip()


# ---------- Parsing helpers ----------
_TITLE_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
_META_RE = re.compile(r"^META:\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)
_TLDR_RE = re.compile(r"^TL;DR:\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)
_H2_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
_H3_RE = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
_BULLET_RE = re.compile(r"^\s*[-*]\s+.+$", re.MULTILINE)
_NUM_LIST_RE = re.compile(r"^\s*\d+[.)]\s+.+$", re.MULTILINE)
_QUESTION_RE = re.compile(r"^###\s*(?:Q[:.]?\s*)?(.+\?)\s*$", re.MULTILINE)


def _strip_markdown(md: str) -> str:
    """Best-effort strip of markdown to plain body text for readability metrics."""
    text = re.sub(r"^META:.*$", "", md, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"^TL;DR:.*$", "", text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_`>]", "", text)
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)  # links
    text = re.sub(r"\s+\n", "\n", text)
    return text.strip()


def _count_syllables(word: str) -> int:
    word = word.lower()
    word = re.sub(r"[^a-z]", "", word)
    if not word:
        return 0
    if len(word) <= 3:
        return 1
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(count, 1)


def _flesch_reading_ease(text: str) -> float:
    words = re.findall(r"[A-Za-z']+", text)
    sentences = re.split(r"[.!?]+", text)
    sentences = [s for s in sentences if s.strip()]
    if not words or not sentences:
        return 0.0
    syllables = sum(_count_syllables(w) for w in words)
    W = len(words)
    S = len(sentences)
    Sy = max(syllables, 1)
    score = 206.835 - 1.015 * (W / S) - 84.6 * (Sy / W)
    return max(0.0, min(100.0, score))


# ---------- Scoring ----------
def _clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, v))


def _score_content(md: str, inp: GenerateInput) -> dict:
    title_m = _TITLE_RE.search(md)
    meta_m = _META_RE.search(md)
    tldr_m = _TLDR_RE.search(md)
    title = title_m.group(1).strip() if title_m else ""
    meta = meta_m.group(1).strip() if meta_m else ""
    tldr = tldr_m.group(1).strip() if tldr_m else ""

    h2s = [h.strip() for h in _H2_RE.findall(md)]
    h3s = [h.strip() for h in _H3_RE.findall(md)]
    bullets = _BULLET_RE.findall(md)
    num_items = _NUM_LIST_RE.findall(md)
    questions = _QUESTION_RE.findall(md)

    plain = _strip_markdown(md)
    words = re.findall(r"[A-Za-z0-9']+", plain)
    word_count = len(words)
    text_lc = plain.lower()

    keywords = [k.strip().lower() for k in (inp.keywords or []) if k and k.strip()]
    if not keywords and inp.topic:
        keywords = [inp.topic.lower().strip()]

    # Keyword density + presence
    kw_stats = []
    total_kw_hits = 0
    kw_in_title = 0
    kw_in_headings = 0
    for kw in keywords:
        pat = re.compile(r"\b" + re.escape(kw) + r"\b", re.IGNORECASE)
        hits = len(pat.findall(plain))
        total_kw_hits += hits
        density = (hits / word_count * 100) if word_count else 0
        in_title = bool(pat.search(title))
        in_heads = any(pat.search(h) for h in h2s + h3s)
        if in_title:
            kw_in_title += 1
        if in_heads:
            kw_in_headings += 1
        kw_stats.append({
            "keyword": kw,
            "count": hits,
            "density": round(density, 2),
            "in_title": in_title,
            "in_headings": in_heads,
        })

    # ------- SEO score -------
    seo_parts = []
    # Title length (ideal 50-65 chars)
    title_len = len(title)
    title_score = 100 if 50 <= title_len <= 65 else max(0, 100 - abs(title_len - 57) * 3)
    seo_parts.append(("Title length", title_score, f"{title_len} chars (ideal 50-65)"))
    # Meta length (ideal 140-160)
    meta_len = len(meta)
    meta_score = 100 if 140 <= meta_len <= 160 else max(0, 100 - abs(meta_len - 150) * 2)
    seo_parts.append(("Meta description", meta_score, f"{meta_len} chars (ideal 140-160)"))
    # Keyword in title
    kw_title_score = 100 if keywords and kw_in_title >= 1 else (50 if keywords else 0)
    seo_parts.append(("Primary keyword in title", kw_title_score, f"{kw_in_title}/{len(keywords) or 1}"))
    # Keyword in headings
    kw_head_score = 100 if keywords and kw_in_headings >= 1 else (40 if keywords else 0)
    seo_parts.append(("Keyword in headings", kw_head_score, f"{kw_in_headings} keyword(s) in H2/H3"))
    # Density (ideal 0.5-2.5% for the primary keyword)
    primary_density = kw_stats[0]["density"] if kw_stats else 0
    if 0.5 <= primary_density <= 2.5:
        density_score = 100
    elif primary_density == 0:
        density_score = 20
    elif primary_density < 0.5:
        density_score = 60 + (primary_density / 0.5) * 30
    else:  # over-stuffed
        density_score = max(20, 100 - (primary_density - 2.5) * 20)
    seo_parts.append(("Keyword density", density_score, f"{primary_density}% (ideal 0.5-2.5)"))
    # Word count
    if word_count >= 1200:
        wc_score = 100
    elif word_count >= 700:
        wc_score = 85
    elif word_count >= 400:
        wc_score = 65
    else:
        wc_score = 40
    seo_parts.append(("Word count", wc_score, f"{word_count} words"))
    # Structure (H2 count)
    struct_score = _clamp(min(len(h2s), 6) / 6 * 100)
    seo_parts.append(("Heading structure", struct_score, f"{len(h2s)} H2 section(s)"))

    seo_score = round(sum(p[1] for p in seo_parts) / len(seo_parts))

    # ------- AEO score -------
    aeo_parts = []
    # TL;DR / summary answer at top
    tldr_score = 100 if tldr and 20 <= len(tldr.split()) <= 60 else (60 if tldr else 10)
    aeo_parts.append(("Direct-answer summary (TL;DR)", tldr_score, f"{len(tldr.split()) if tldr else 0} words"))
    # FAQ / question sub-heads
    faq_score = _clamp(min(len(questions), 5) / 5 * 100)
    aeo_parts.append(("FAQ / question headings", faq_score, f"{len(questions)} Q&A block(s)"))
    # Question-style H2s (heuristic: contains '?' or starts with What/How/Why/When/Where/Who)
    q_pattern = re.compile(r"\?$|^\s*(what|how|why|when|where|who|is|are|can|should)\b", re.IGNORECASE)
    q_h2 = sum(1 for h in h2s if q_pattern.search(h))
    q_h2_score = _clamp(min(q_h2, 3) / 3 * 100)
    aeo_parts.append(("Question-style H2s", q_h2_score, f"{q_h2} of {len(h2s)}"))
    # Structured lists (bullets + numbered)
    total_list_items = len(bullets) + len(num_items)
    list_score = _clamp(min(total_list_items, 10) / 10 * 100)
    aeo_parts.append(("Structured lists", list_score, f"{total_list_items} list item(s)"))
    # Short paragraphs (heuristic: avg words per paragraph ≤ 90)
    paras = [p for p in re.split(r"\n\s*\n", plain) if p.strip() and not p.strip().startswith("#")]
    if paras:
        avg_p_words = sum(len(re.findall(r"\w+", p)) for p in paras) / len(paras)
    else:
        avg_p_words = 0
    para_score = 100 if 25 <= avg_p_words <= 90 else max(30, 100 - abs(avg_p_words - 60) * 1.5)
    aeo_parts.append(("Scannable paragraphs", para_score, f"~{int(avg_p_words)} words/paragraph"))
    # First-sentence answer (starts with declarative, not fluffy intro)
    first_sentence = ""
    for p in paras:
        first_sentence = re.split(r"[.!?]", p.strip())[0]
        if first_sentence and len(first_sentence.split()) >= 4:
            break
    fluff = re.match(r"^(in this article|this article|welcome|today we|hello)\b", first_sentence.strip(), re.IGNORECASE)
    fs_score = 40 if fluff else 100 if first_sentence else 50
    aeo_parts.append(("Direct opening sentence", fs_score, first_sentence[:80] or "—"))
    # Key takeaways section
    has_takeaways = bool(re.search(r"##\s*(key takeaways|takeaways|summary)", md, re.IGNORECASE))
    kt_score = 100 if has_takeaways else 40
    aeo_parts.append(("Key Takeaways block", kt_score, "present" if has_takeaways else "missing"))

    aeo_score = round(sum(p[1] for p in aeo_parts) / len(aeo_parts))

    # Readability
    read_ease = _flesch_reading_ease(plain)
    # Map: 60-70 is ideal; farther = less
    if 60 <= read_ease <= 75:
        read_score = 100
    else:
        read_score = max(0, 100 - abs(read_ease - 67) * 1.5)

    overall = round(seo_score * 0.45 + aeo_score * 0.45 + read_score * 0.10)

    # Suggestions
    suggestions: List[str] = []
    if title_score < 80:
        suggestions.append(f"Adjust the title length to 50-65 characters (currently {title_len}).")
    if meta_score < 80:
        suggestions.append(f"Refine the meta description to 140-160 characters (currently {meta_len}).")
    if kw_title_score < 100 and keywords:
        suggestions.append("Include the primary keyword in the article title.")
    if kw_head_score < 100 and keywords:
        suggestions.append("Add the primary keyword to at least one H2/H3 heading.")
    if density_score < 80:
        suggestions.append(f"Keyword density is {primary_density}% — aim for 0.5-2.5%.")
    if wc_score < 80:
        suggestions.append(f"Content is only {word_count} words — expand to 800+ for stronger ranking.")
    if faq_score < 80:
        suggestions.append("Add a FAQ section with 3-5 question/answer pairs to boost AEO.")
    if q_h2_score < 80:
        suggestions.append("Phrase 1-2 H2 headings as questions users might ask AI assistants.")
    if list_score < 60:
        suggestions.append("Add more bulleted or numbered lists to improve scannability for LLMs.")
    if tldr_score < 80:
        suggestions.append("Open with a 25-40 word direct answer (TL;DR) that AI engines can quote.")
    if not has_takeaways:
        suggestions.append("Add a final 'Key Takeaways' bulleted summary.")

    breakdown = {
        "seo": [{"label": p[0], "score": round(p[1]), "detail": p[2]} for p in seo_parts],
        "aeo": [{"label": p[0], "score": round(p[1]), "detail": p[2]} for p in aeo_parts],
        "keywords": kw_stats,
    }

    return {
        "title": title or inp.topic,
        "meta_description": meta,
        "tldr": tldr,
        "word_count": word_count,
        "scores": {
            "seo": seo_score,
            "aeo": aeo_score,
            "readability": round(read_score),
            "flesch": round(read_ease, 1),
            "overall": overall,
        },
        "breakdown": breakdown,
        "suggestions": suggestions,
        "counts": {
            "h2": len(h2s),
            "h3": len(h3s),
            "bullets": len(bullets),
            "numbered": len(num_items),
            "questions": len(questions),
        },
    }


# ---------- Public endpoint ----------
# Import get_current_user lazily to avoid circular import at module load.
def _auth_dep():
    from server import get_current_user  # noqa: WPS433
    return get_current_user


@content_writer_router.post("/generate", response_model=GenerateResponse)
async def content_writer_generate(body: GenerateInput, user: dict = Depends(_auth_dep())):
    md = await _generate_content_llm(body)
    scored = _score_content(md, body)
    return GenerateResponse(
        id=str(uuid.uuid4()),
        title=scored["title"],
        meta_description=scored["meta_description"],
        content=md,
        word_count=scored["word_count"],
        scores=scored["scores"],
        breakdown=scored["breakdown"],
        suggestions=scored["suggestions"],
    )


@content_writer_router.post("/score")
async def content_writer_score(payload: dict, user: dict = Depends(_auth_dep())):
    """Re-score an already-generated / edited markdown without a new LLM call."""
    md = (payload or {}).get("content", "")
    if not md.strip():
        raise HTTPException(status_code=400, detail="content is required")
    dummy = GenerateInput(
        topic=(payload.get("topic") or "").strip() or "topic",
        keywords=payload.get("keywords") or [],
        prompt=None,
        tone="professional",
        length="medium",
    )
    scored = _score_content(md, dummy)
    scored["content"] = md
    return scored
