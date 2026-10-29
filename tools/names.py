"""Turnuva adlarını okunur hâle getirir (yalnızca görünen ad; URL'ler değişmez).

vugraph'a kulüpler adları çok farklı yazıyor: "2810202602", "28 eEKİM ÇARŞAMBA",
"10 Ekım2026smlt", "Sä°multane", "CUMA 2li"... Tarih zaten ayrıca gösterildiği
için baştaki tarih atılır, yazım hataları düzeltilir, ad boş kalırsa gün adı kullanılır.
"""
import datetime
import re

GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
AYLAR = r"(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)"
KISALTMA = {"TBF": "TBF", "IMP": "IMP", "MP": "MP", "İTÜ": "İTÜ", "ITU": "İTÜ", "ODTÜ": "ODTÜ", "BBO": "BBO", "İMP": "IMP"}

# (desen, yerine) — büyük/küçük harf duyarsız, kelime bazında
DUZELT = [
    (r"\bCumarytesi\b", "Cumartesi"), (r"\bC\.?tesi\b", "Cumartesi"), (r"\bCts\b", "Cumartesi"),
    (r"\bPersembe\b", "Perşembe"), (r"\bCarsamba\b", "Çarşamba"), (r"\bSali\b", "Salı"),
    (r"\bAksam\b", "Akşam"), (r"\bCanli\b", "Canlı"), (r"\bTrunuvası\b", "Turnuvası"),
    (r"\bS[ıi]m[ıi]?[uü]ltane\b", "Simultane"), (r"\bSimültane\b", "Simultane"),
    (r"smlt\b", " Simultane"), (r"\bSim\s+Tur\b", "Simultane"),
    (r"\b2\s*li\b", "İkili"), (r"\bİkil\b", "İkili"), (r"\bPa[ıi]rs\b", "İkili"),
    (r"\bH\.\s*eller\b", "Hazır Eller"),
    (r"\bLeh-(\d+)\b", r"Lehman \1"), (r"\bLehman-(\d+)\b", r"Lehman \1"),
    (r"\bMAJ[OÖ]R\b", "Major"),
]

# baştaki tarih: "28 Ekim", "09.ekim 2026", "28.10.2026", "28 eEKİM", "3ekim", "10 Ekım2026"
TARIH = re.compile(
    r"^\s*(?:\d{1,2}\s*[.\s]?\s*e?" + AYLAR.replace("ekim", "ek[iı]m") + r"(?:\s*\d{4})?"
    r"|\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*[-–,.]?\s*", re.I)


def _cap(w):
    up = w.replace("i", "İ").replace("ı", "I").upper()
    if up in KISALTMA:
        return KISALTMA[up]
    if w.isupper() and len(w) > 1 or w[:1].islower():
        lo = w.replace("İ", "i").replace("I", "ı").lower()
        return lo[:1].replace("i", "İ").replace("ı", "I").upper() + lo[1:]
    return w


def clean_name(name, date=None):
    gun = None
    if date:
        try:
            gun = GUNLER[datetime.date.fromisoformat(date).weekday()]
        except ValueError:
            pass
    s = re.sub(r"\s+", " ", (name or "").strip())

    # yalnızca tarih kodu: DDMMYYYY + oturum no (ör. 2810202602)
    m = re.fullmatch(r"\d{8}(\d{1,2})?", s)
    if m:
        no = int(m.group(1)) if m.group(1) else 0
        return f"{gun or 'Kulüp'} Turnuvası" + (f" {no}" if no else "")

    s = s.replace("Ä°", "İ").replace("ä°", "i")  # bozuk UTF-8 (İ)
    s = re.sub(r"^(\d+)([a-zçğıöşü]{3,})", r"\1 \2", s)  # "4ereğli" → "4 ereğli"
    for pat, rep in DUZELT:
        s = re.sub(pat, rep, s, flags=re.I)
    s = TARIH.sub("", s).strip(" -–,.")
    s = re.sub(r"[A-Za-zÇĞİÖŞÜçğıöşü]+", lambda m: _cap(m.group(0)), s)
    s = re.sub(r"\s+", " ", s).strip()

    if not s or re.fullmatch(r"\d+", s):
        return f"{gun} Turnuvası" if gun else (name or "").strip()
    if gun and s.lower() in {g.lower() for g in GUNLER}:  # yalnız gün adı → "Cuma Turnuvası"
        return f"{s} Turnuvası"
    return s
