#!/usr/bin/env python3
"""一次性离线工具：沪教版（五·四学制）英语五年级上册 PDF → 结构化课文数据。

从教材 PDF 抽取目标模块（Talking time / Story time / Reading time / Chant time /
Rhyme time / Song time）的课文句子，产出 content/textbook/grade5a.json。
运行时不解析 PDF——本脚本只在更新教材数据时手动运行一次。

## 运行环境（Python 依赖不进 package.json、不污染仓库）

venv 建在主仓库的 materials/ 下（该目录已被 .gitignore 忽略）。重建方式：

    python3 -m venv /Users/cherypeng/Claude/english-readalong/materials/textbook-extract-venv
    /Users/cherypeng/Claude/english-readalong/materials/textbook-extract-venv/bin/pip install pymupdf

## 运行

    materials/textbook-extract-venv/bin/python scripts/extract-textbook.py
    # PDF 路径不对时：materials/textbook-extract-venv/bin/python scripts/extract-textbook.py --pdf <路径>

教材 PDF 只放在本地 materials/textbook/（不进仓库）；产物 JSON 写入本仓库 content/textbook/。

## 抽取原理（教材排版约定，见 content/textbook/REVIEW-NOTES.md）

- 书页码 N 对应 PDF 第 N+5 页（pageOffset=5）。
- 模块头是页顶（y<60）15pt CambridgeRound-Bold 文本（"Talking time" 等）；
  模块正文 = 头页起、到下一个页顶模块头或下一单元扉页之前。
- 课文正文一律 14pt CambridgeRound-Regular（U4 Reading time 的日记体为
  14pt TektonPro-Bold 手写体）；练习指令（Bold）、语法框（Light）、
  语音栏（Delius）、图注/填空（Semibold/ComicNeue/FZ 字体、\\x08 与连续宽空格）
  全部靠字体/字符过滤掉。
- Talking time 的对话按场景分块（插图编号 ①②…），文本列与插图左右交错，
  列顺序无全局规律，逐页用 TALKING_WINDOWS 显式给出有序场景窗口
  （窗口坐标为 PDF 点，(x0, x1, y0, y1)），窗口顺序 = 场景顺序。
- 其余模块正文把全部保留行按 (页, y, x) 排序后拼接、按句号/叹号/问号切句。
- 逗号结尾的行与下一行拼接时，行首的 And/But/So/Why/To 等虚词转小写
  （教材歌谣/儿歌每行行首大写是排版风格，非句子边界）。
- 弯引号 “” 按既有 content/units 惯例剥除；’ 归一为 '。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import pymupdf

# ---------------------------------------------------------------------------
# 教材结构配置（由人工核对 PDF 目录页与逐页排版得出）
# ---------------------------------------------------------------------------

PAGE_OFFSET = 5  # 书页码 N = PDF 页 N+5

# 每单元：unitId 序号、扉页 PDF 页、单元标题（取自教材目录页）
UNITS = [
    (1, 14, "Clubs in our school"),
    (2, 22, "Traditional games"),
    (3, 30, "Amazing plants"),
    (4, 38, "Together with animals"),
    (5, 46, "Seeing a doctor"),
    (6, 54, "Rise to the challenge"),
    (7, 62, "Great scientists"),
    (8, 70, "Useful inventions"),
    (9, 78, "Using computers"),
    (10, 86, "A greener life"),
]

# 模块：单元序号 -> [(moduleKind, 头页 PDF 页, 模块标题（取自教材目录页）)]
MODULES = {
    1: [("Talking time", 17, "It's good to join clubs"), ("Story time", 19, "At the Pottery Club")],
    2: [("Talking time", 25, "As fast as the wind"), ("Story time", 27, "The dragon dance")],
    3: [("Chant time", 32, "Parts of plants"), ("Talking time", 33, "A visit to the botanical gardens"), ("Reading time", 35, "Plants and the weather")],
    4: [("Talking time", 41, "In a safari park"), ("Reading time", 43, "The animal observation diary")],
    5: [("Rhyme time", 48, "Nice doctors"), ("Talking time", 49, "At the eye clinic"), ("Story time", 51, "The story of Hua Tuo")],
    6: [("Talking time", 57, "Be better"), ("Story time", 59, "My left foot")],
    7: [("Rhyme time", 64, "Science"), ("Talking time", 65, "Do you know them?"), ("Reading time", 67, "Great scientists")],
    8: [("Talking time", 73, "New inventions"), ("Reading time", 75, "The wheel moves on")],
    9: [("Talking time", 81, "Interesting facts about computers"), ("Reading time", 83, "Got a problem? Ask Simon!")],
    10: [("Song time", 88, "Reduce, reuse, recycle"), ("Talking time", 89, "Habits for a greener life"), ("Story time", 91, "Baggie's new life")],
}

# Talking time 场景窗口：(x0, x1, y0, y1)，列表顺序 = 场景顺序（插图编号 ①②…）。
# 仅对话头页需要；对话均单页排完（后续页为练习/语法框，无 14pt Regular 正文）。
TALKING_WINDOWS: dict[int, list[tuple[float, float, float, float]]] = {
    17: [(40, 250, 150, 400), (260, 540, 400, 700)],          # U1: 文左图右 → 图左文右
    25: [(260, 540, 150, 400), (40, 250, 400, 700)],          # U2: 图左文右 → 文左图右
    33: [(40, 250, 100, 180), (40, 250, 330, 500), (260, 540, 285, 400), (40, 250, 605, 754), (260, 540, 545, 754)],  # U3: 引入句 + ①-④ 四宫格
    41: [(40, 540, 250, 400), (40, 540, 540, 700)],           # U4: 图右文左，两场景上下排
    49: [(40, 250, 100, 400), (260, 540, 360, 600)],          # U5: 文左图右 → 图左文右
    57: [(40, 250, 100, 180), (260, 540, 180, 400), (40, 250, 400, 650)],  # U6: 引入句 + 场景1右 + 场景2左
    65: [(260, 540, 150, 380), (40, 250, 380, 700)],          # U7
    73: [(260, 540, 130, 400), (40, 250, 400, 650)],          # U8
    81: [(40, 540, 100, 500)],                                # U9: 引入句 + 单列对话（无场景编号）
    89: [(260, 540, 150, 400), (40, 250, 400, 700)],          # U10
}

# 特定模块的额外正文行白名单字体（默认只有 CambridgeRound-Regular）
EXTRA_FONTS: dict[tuple[int, str], set[str]] = {
    # U4 Reading time：日记体为手写体 TektonPro-Bold
    (4, "Reading time"): {"TektonPro-Bold"},
}

# U4 Reading time：日记的日期/天气行不是课文句子
WEEKDAY_LINE = re.compile(r"^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b")
WEATHER_LINE = re.compile(r"^(Sunny|Cloudy|Rainy|Windy|Snowy)$")

# U9 Reading time：书信的称呼/落款不是课文句子
LETTER_FRAME = re.compile(r"^(Dear\b|From\b|Hi\b.*!$|Simon$|Lightning \d+$|Star \d+$)")

# 行首大写虚词：行拼接（前一行以逗号等非句末标点结尾）时转小写
JOIN_LOWER_WORDS = {"And", "But", "Or", "So", "Then", "Why", "To", "As", "That", "When", "If", "Because"}

# 拼接可疑模式：引语被剥掉引号后并进叙述句
SUSPICIOUS_JOIN = re.compile(r",\s*(Wow|Oh|Ah|Yes|No|Well|Please|Look|Huh)\b")
# 叙述动词后经逗号接大写（“Miss Li says, All …”），多半是引语起点被并进叙述句
ATTRIBUTION_QUOTE = re.compile(r"\b(says|asked|asks|replied|calls|thought)\b[^.!?]*,\s*[A-Z]")
# 句中出现 ?/! 后接小写，多半是引语+叙述语被并成一句（引号剥除后）
MID_SENTENCE_TERMINAL = re.compile(r"[?!]\s+[a-z]")

WIDE_SPACE_RUN = re.compile(r"[  ]{2,}")
CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def find_pdf(explicit: str | None) -> Path:
    """定位教材 PDF：显式参数 > 脚本同级仓库的 materials/ > 主仓库工作区的 materials/。"""
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    script_dir = Path(__file__).resolve().parent
    candidates.append(script_dir.parent / "materials" / "textbook" / "新版五上英语.pdf")
    try:
        common_dir = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        candidates.append((Path(common_dir) / "..").resolve() / "materials" / "textbook" / "新版五上英语.pdf")
    except Exception:
        pass
    for c in candidates:
        if c.is_file():
            return c
    sys.exit("找不到教材 PDF，请用 --pdf 指定路径。尝试过：\n" + "\n".join(str(c) for c in candidates))


def repo_root() -> Path:
    top = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True
    ).stdout.strip()
    return Path(top)


def page_lines(page: pymupdf.Page) -> list[dict]:
    """页面上所有文本行，带 y/x/size/font/line_text。"""
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in line["spans"])
            out.append({
                "y": round(line["bbox"][1], 1),
                "x": round(line["bbox"][0], 1),
                "size": round(spans[0]["size"], 1),
                "font": spans[0]["font"],
                "text": text,
            })
    return out


def top_header(page: pymupdf.Page) -> str | None:
    """页顶（y<60）15pt Bold 模块头文本，如 'Talking time'。"""
    for l in page_lines(page):
        if l["y"] < 60 and l["size"] >= 15 and "Bold" in l["font"]:
            return l["text"].strip()
    return None


def module_body_pages(doc, header_pdf: int, unit_end_pdf: int) -> list[int]:
    """模块正文页：头页起，到下一个页顶模块头/下一单元扉页之前。"""
    pages = [header_pdf]
    p = header_pdf + 1
    while p < unit_end_pdf:
        if top_header(doc[p]) is not None:
            break
        pages.append(p)
        p += 1
    return pages


def clean_line(text: str) -> str:
    """去掉朗读图标等控制字符，宽空格与连续空白归一。"""
    text = CONTROL_CHARS.sub("", text.replace("\x07", ""))
    text = WIDE_SPACE_RUN.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def is_noise_line(line: dict, extra_fonts: set[str]) -> bool:
    """字体与填空标记过滤：非正文十四号字、填空框、含连续宽空格的行都是噪声。"""
    if line["size"] != 14:
        return True
    if line["font"] != "CambridgeRound-Regular" and line["font"] not in extra_fonts:
        return True
    text = line["text"]
    if "\x08" in text or WIDE_SPACE_RUN.search(text):
        return True
    return False


def module_specific_drop(unit_no: int, module_kind: str, text: str) -> bool:
    if (unit_no, module_kind) == (4, "Reading time") and (WEEKDAY_LINE.match(text) or WEATHER_LINE.match(text)):
        return True
    if (unit_no, module_kind) == (9, "Reading time") and LETTER_FRAME.match(text):
        return True
    return False


def split_sentences(text: str) -> list[str]:
    """按 .!? 后跟大写/数字/引号（或文本末尾）切句。"""
    sentences, start = [], 0
    for m in re.finditer(r"[.!?]", text):
        nxt = text[m.end():].lstrip()
        at_end = m.end() >= len(text.rstrip()) or not nxt
        if at_end or (nxt and (nxt[0].isupper() or nxt[0].isdigit() or nxt[0] in "“\"'")):
            sentence = text[start:m.end() + 1].strip()
            if sentence:
                sentences.append(sentence)
            start = m.end() + 1
    tail = text[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


def window_lines(doc, pdf_page: int, window: tuple[float, float, float, float], extra_fonts: set[str]) -> list[dict]:
    x0, x1, y0, y1 = window
    out = []
    for l in page_lines(doc[pdf_page]):
        if is_noise_line(l, extra_fonts):
            continue
        if not (x0 <= l["x"] <= x1 and y0 <= l["y"] <= y1):
            continue
        text = clean_line(l["text"])
        if not text:
            continue
        out.append({**l, "text": text})
    return sorted(out, key=lambda l: (l["y"], l["x"]))


def exercise_cut_y(page: pymupdf.Page) -> float | None:
    """页面上第一条练习指令/栏目行（14pt CambridgeRound-Bold 且含英文单词，页顶模块头以下）的 y。

    教材版式是“正文在上、练习在下”，正文不会出现在练习指令之下；
    插图编号（孤立的 '1'/'2' 数字，Bold-14）不算指令，U4 日记体正文是
    TektonPro-Bold 也不算。
    """
    cut = None
    for l in page_lines(page):
        if l["size"] != 14 or l["font"] != "CambridgeRound-Bold" or l["y"] <= 100:
            continue
        if sum(ch.isalpha() for ch in l["text"]) < 3:
            continue
        cut = l["y"] if cut is None else min(cut, l["y"])
    return cut


def extract_module(doc, unit_no: int, module_kind: str, header_pdf: int, unit_end_pdf: int) -> tuple[list[str], list[str], list[int], list[int]]:
    """返回 (句子列表, 提取备注, needsReview 句子下标, 正文 PDF 页列表)。"""
    extra_fonts = EXTRA_FONTS.get((unit_no, module_kind), set())
    notes: list[str] = []
    pages = module_body_pages(doc, header_pdf, unit_end_pdf)

    # 1) 收集正文行
    collected: list[dict] = []  # 元素带 page 序号供排序
    if module_kind == "Talking time":
        windows = TALKING_WINDOWS.get(header_pdf)
        if windows is None:
            notes.append(f"PDF 第 {header_pdf} 页无场景窗口配置，按整页 y 序抽取，请重点人工核对语序。")
            windows = [(0, 1000, 0, 2000)]
        for w_idx, win in enumerate(windows):
            for l in window_lines(doc, header_pdf, win, extra_fonts):
                collected.append({**l, "page": 0, "window": w_idx})
        if len(pages) > 1:
            notes.append(f"对话后续页（PDF {pages[1:]}）没有 14pt Regular 正文，确认无遗漏。")
    else:
        for p in pages:
            cut_y = exercise_cut_y(doc[p])
            for l in page_lines(doc[p]):
                if cut_y is not None and l["y"] >= cut_y:
                    continue
                if is_noise_line(l, extra_fonts):
                    continue
                text = clean_line(l["text"])
                if not text or module_specific_drop(unit_no, module_kind, text):
                    continue
                collected.append({**l, "text": text, "page": p, "window": 0})

    # 2) 行 → 句：非句末标点结尾的行与下一行拼接；弯引号按既有内容包惯例全部剥除
    raw_lines = [l["text"] for l in sorted(collected, key=lambda l: (l["page"], l["window"], l["y"], l["x"]))]
    text_parts: list[str] = []
    buf = ""
    for raw in raw_lines:
        line = raw.replace("“", "").replace("”", "").replace('"', "").strip()
        if not line:
            continue
        if buf and not re.search(r"[.!?]$", buf):
            first = line.split(" ", 1)[0]
            if first in JOIN_LOWER_WORDS:
                line = first.lower() + (line[len(first):] if len(line) > len(first) else "")
            buf += " " + line
        else:
            if buf:
                text_parts.append(buf)
            buf = line
    if buf:
        text_parts.append(buf)

    # 3) 切句、归一撇号
    sentences: list[str] = []
    for part in text_parts:
        for s in split_sentences(part):
            s = s.replace("’", "'").strip()
            if s:
                sentences.append(s)

    # 4) 置信度自查
    needs_review: list[int] = []
    for i, s in enumerate(sentences):
        if SUSPICIOUS_JOIN.search(s) or MID_SENTENCE_TERMINAL.search(s) or ATTRIBUTION_QUOTE.search(s):
            needs_review.append(i)
            notes.append(f"句子 {i} 疑似引语边界拼接，请人工核对：{s}")
    if text_parts and not re.search(r"[.!?]$", sentences[-1] if sentences else ""):
        needs_review.append(len(sentences) - 1)
        notes.append(f"末句无句末标点，可能截断：{sentences[-1] if sentences else ''}")
    return sentences, notes, needs_review, pages


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf", help="教材 PDF 路径（默认自动定位 materials/textbook/新版五上英语.pdf）")
    ap.add_argument("--check-only", action="store_true", help="只打印统计，不写产物")
    args = ap.parse_args()

    pdf_path = find_pdf(args.pdf)
    doc = pymupdf.open(pdf_path)
    root = repo_root()

    units_json = []
    total_modules = total_sentences = total_review = 0
    for unit_no, opener_pdf, unit_title in UNITS:
        next_opener = UNITS[unit_no][1] if unit_no < len(UNITS) else 94  # 94 = Words to use（书 p89）
        # 扉页核对（扉页有大号 'Unit N' 与单元标题；标题可能折行，归一空白后比对）
        opener_text = re.sub(r"\s+", " ", doc[opener_pdf].get_text())
        if f"Unit {unit_no}" not in opener_text or unit_title not in opener_text:
            print(f"警告：PDF 第 {opener_pdf} 页未见 'Unit {unit_no}'/{unit_title}，请人工检查扉页。")
        modules_json = []
        for module_kind, header_pdf, module_title in MODULES[unit_no]:
            sentences, notes, needs_review, body_pages = extract_module(doc, unit_no, module_kind, header_pdf, next_opener)
            if not sentences:
                sys.exit(f"单元 {unit_no} {module_kind}（PDF 第 {header_pdf} 页）没有抽到句子，中止。")
            last_content_pdf = body_pages[-1] if module_kind != "Talking time" else header_pdf
            first_book, last_book = pages_to_book(header_pdf, last_content_pdf)
            book_span = f"p{first_book}" if first_book == last_book else f"p{first_book}-{last_book}"
            modules_json.append({
                "moduleKind": module_kind,
                "title": module_title,
                "sourcePages": book_span,
                "sentences": sentences,
                "needsReview": needs_review,
                "notes": notes,
            })
            total_modules += 1
            total_sentences += len(sentences)
            total_review += len(needs_review)
            flagged = f"，needsReview {len(needs_review)}" if needs_review else ""
            print(f"五上-U{unit_no} {module_kind:12} {book_span:8} {len(sentences):2} 句{flagged} {module_title}")
        units_json.append({
            "unitId": f"五上-U{unit_no}",
            "index": unit_no,
            "title": unit_title,
            "modules": modules_json,
        })

    data = {
        "schemaVersion": 1,
        "textbook": {
            "id": "grade5a",
            "series": "沪教版（五·四学制）英语",
            "title": "五年级上册",
            "source": "教材 PDF（本地 materials/textbook/新版五上英语.pdf，不进仓库）",
            "pageOffset": PAGE_OFFSET,
            "extractedAt": "2026-10-25",
        },
        "units": units_json,
    }

    print(f"\n共 {len(units_json)} 个单元 / {total_modules} 个模块 / {total_sentences} 句 / needsReview {total_review} 句")
    if args.check_only:
        return
    out_path = root / "content" / "textbook" / "grade5a.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写入 {out_path}")


def pages_to_book(first_pdf: int, last_pdf: int) -> tuple[int, int]:
    return first_pdf - PAGE_OFFSET, last_pdf - PAGE_OFFSET


if __name__ == "__main__":
    main()
