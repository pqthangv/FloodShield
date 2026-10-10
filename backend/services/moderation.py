"""Keeps swearing and slurs out of community posts (App Store guideline 1.2, Google Play UGC policy).

Words are matched whole, never as part of a longer word ("class", "assess" are fine), and
Vietnamese words only with their accents: without them, the swear words are everyday words
(lồn → "lớn", cặc → "các", đĩ → "đi", buồi → "buổi", đéo → "đeo"). Mild words are left alone:
wrongly refusing a flood report costs more than a rude word, which people can still report.
"""

import re
import unicodedata
from typing import Optional

# Vietnamese, with accents.
VI_WORDS = {"địt", "đụ", "lồn", "cặc", "buồi", "đĩ", "đéo"}
# Vietnamese abbreviations, which mean nothing else ("110 cc" motorbikes: so no "cc").
VI_ABBREVIATIONS = {
    "dm", "đm", "dmm", "đmm", "dcm", "đcm", "dkm", "đkm", "dmcs", "đmcs",
    "cmm", "cmn", "clm", "clgt", "vcl", "vkl", "vcc", "vl", "loz",
}
# Vietnamese phrases typed without accents.
VI_PHRASES = {("dit", "me"), ("dit", "con", "me"), ("du", "ma"), ("du", "me")}
# English: any word starting with one of these...
EN_PREFIXES = (
    "fuck", "fck", "motherf", "shit", "bullshit", "bitch", "cunt", "whore", "slut",
    "asshole", "arsehole", "dickhead", "bastard", "wanker", "faggot",
)
# ...and these exact words ("Fukushima", "niggling", "fire retardant" are fine).
EN_WORDS = {
    "fuk", "fukin", "fuking", "fag", "fags", "nigger", "niggers", "nigga", "niggas",
    "twat", "twats", "pussy", "pussies", "retard", "retards", "retarded",
}

_WORDS = VI_WORDS | VI_ABBREVIATIONS | EN_WORDS
_LONGEST_PHRASE = max(len(phrase) for phrase in VI_PHRASES)
# The marks people put inside a word to get past a filter: "f*ck", "đ.m", "s-h-i-t".
_MARKS_INSIDE_WORD = re.compile(r"(?<=\w)[*.\-_]+(?=\w)")


def words(text: str) -> list[str]:
    # NFC: the same letter typed with a combining accent; "ð" (Icelandic eth) stands in for "đ".
    text = unicodedata.normalize("NFC", text).casefold().replace("ð", "đ")
    return re.findall(r"\w+", _MARKS_INSIDE_WORD.sub("", text))


def has_bad_words(*texts: Optional[str]) -> bool:
    for text in texts:
        tokens = words(text or "")
        for i, word in enumerate(tokens):
            if word in _WORDS or word.startswith(EN_PREFIXES):
                return True
            if any(tuple(tokens[i:i + n]) in VI_PHRASES for n in range(2, _LONGEST_PHRASE + 1)):
                return True
    return False
