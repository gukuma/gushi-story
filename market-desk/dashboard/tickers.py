"""Find stock tickers in DeerFlow conversations and reports, and group conversations by ticker.

A conversation can mention several stocks; it is listed under every one of them. Conversations
with many tickers (sector scans, "top 10" studies) are also listed under 多标的, and scheduled
briefs go to their own group so daily market wraps don't flood every stock.

Codes are normalised like market_data.py: sh600519, sz300750, bj430047, hk00700.
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.request
from pathlib import Path

# Well-known names → code. Learned names (watchlist, reports, file names, quotes) are added at runtime.
BUILTIN = {
    "sh600519": "贵州茅台", "sz300750": "宁德时代", "sh601318": "中国平安", "sh600036": "招商银行",
    "sh601398": "工商银行", "sh601939": "建设银行", "sh601288": "农业银行", "sh601988": "中国银行",
    "sh600941": "中国移动", "sh601857": "中国石油", "sh600938": "中国海油", "sh601138": "工业富联",
    "sz000858": "五粮液", "sz000333": "美的集团", "sz002594": "比亚迪", "sh600900": "长江电力",
    "sh601012": "隆基绿能", "sz000651": "格力电器", "sh600276": "恒瑞医药", "sz300760": "迈瑞医疗",
    "sh688981": "中芯国际", "sh601628": "中国人寿", "sh600030": "中信证券", "sh601166": "兴业银行",
    "sz000001": "平安银行", "sh600028": "中国石化", "sh601088": "中国神华", "sh601899": "紫金矿业",
    "sh600309": "万华化学", "sz002415": "海康威视", "sh600887": "伊利股份", "sz000568": "泸州老窖",
    "sh600809": "山西汾酒", "sz002475": "立讯精密", "sz300059": "东方财富", "sh601728": "中国电信",
    "sh600050": "中国联通", "sh601668": "中国建筑", "sh601390": "中国中铁", "sh600104": "上汽集团",
    "sh601633": "长城汽车", "sz002230": "科大讯飞", "sh688111": "金山办公", "sh603259": "药明康德",
    "sz300124": "汇川技术", "sz002714": "牧原股份", "sh600436": "片仔癀", "sz000725": "京东方A",
    "sh601888": "中国中免", "sh601601": "中国太保", "sh600000": "浦发银行", "sh601328": "交通银行",
    "sh600016": "民生银行", "sh601818": "光大银行", "sz000002": "万科A", "sh600048": "保利发展",
    "sh600585": "海螺水泥", "sz300274": "阳光电源", "sz300015": "爱尔眼科", "sh688041": "海光信息",
    "sh688256": "寒武纪", "sz000063": "中兴通讯", "sh601919": "中远海控", "sh600019": "宝钢股份",
    "sh601006": "大秦铁路", "sh600690": "海尔智家", "sz000100": "TCL科技", "sz002371": "北方华创",
    "sh688012": "中微公司", "sh601816": "京沪高铁", "sz300308": "中际旭创", "sz300502": "新易盛",
    "sh601127": "赛力斯",
    "hk00700": "腾讯控股", "hk09988": "阿里巴巴", "hk03690": "美团", "hk01810": "小米集团",
    "hk09618": "京东集团", "hk09999": "网易", "hk01211": "比亚迪股份", "hk00005": "汇丰控股",
    "hk01299": "友邦保险", "hk00388": "香港交易所", "hk09888": "百度集团", "hk01024": "快手",
    "hk02015": "理想汽车", "hk09868": "小鹏汽车", "hk09866": "蔚来", "hk00883": "中国海洋石油",
    "hk02020": "安踏体育", "hk02319": "蒙牛乳业", "hk00175": "吉利汽车", "hk09961": "携程集团",
    "hk06618": "京东健康", "hk09626": "哔哩哔哩", "hk00992": "联想集团", "hk02382": "舜宇光学科技",
}
ALIASES = {
    "茅台": "sh600519", "宁德": "sz300750", "工行": "sh601398", "建行": "sh601939", "农行": "sh601288",
    "中行": "sh601988", "招行": "sh600036", "腾讯": "hk00700", "阿里": "hk09988", "小米": "hk01810",
    "中芯": "sh688981", "海康": "sz002415", "迈瑞": "sz300760", "恒瑞": "sh600276", "汾酒": "sh600809",
    "Moutai": "sh600519", "Kweichow Moutai": "sh600519", "CATL": "sz300750", "Tencent": "hk00700",
    "Alibaba": "hk09988", "Xiaomi": "hk01810", "Meituan": "hk03690", "BYD": "sz002594", "SMIC": "sh688981",
}
# Index codes are context, not stocks: never a conversation group.
INDEXES = {"sh000001", "sh000300", "sh000688", "sh000905", "sh000016", "sh000852", "sz399001", "sz399006",
           "sz399005", "hkHSI", "hkHSTECH", "hkHSCEI"}
AMBIGUOUS_BARE = {"000001", "000300", "000688", "000905", "000016", "000852"}  # SSE index vs SZ stock

_CJK_NAME = r"[一-鿿A-Z]{2,8}"


def norm6(code: str) -> str:
    if code[0] in "659":
        return "sh" + code
    if code[0] in "48":
        return "bj" + code
    return "sz" + code


class Resolver:
    def __init__(self, cache_file: Path):
        self.cache_file = cache_file
        self.names: dict[str, str] = dict(BUILTIN)
        self.lock = threading.Lock()
        try:
            self.names.update(json.loads(cache_file.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
        self._dirty = False

    def learn(self, code: str, name: str) -> None:
        name = re.sub(r"^(XD|XR|DR|N|C)(?=[\u4e00-\u9fff])", "", name.strip())  # ex-dividend / new-listing markers
        if code and name and len(name) >= 2 and code not in INDEXES and self.names.get(code) != name:
            if code not in BUILTIN:
                self.names[code] = name
                self._dirty = True

    def name_index(self) -> list[tuple[str, str]]:
        pairs = [(n, c) for c, n in self.names.items() if len(n) >= 2]
        pairs += list(ALIASES.items())
        return sorted(pairs, key=lambda p: -len(p[0]))  # longest first

    def fill_missing(self, codes: set[str]) -> None:
        """Look up names for codes we haven't seen (Tencent quote API), cached on disk."""
        missing = [c for c in codes if c not in self.names and c not in INDEXES][:40]
        if not missing:
            return
        try:
            import market_data as md  # same certificate handling as the quote feeds
            text = md._get("https://qt.gtimg.cn/q=" + ",".join(missing), encoding="gbk")
            for line in text.splitlines():
                m = re.match(r"v_(\w+)=\"[^~]*~([^~]+)~", line)
                if m:
                    self.learn(m.group(1), m.group(2))
        except Exception:
            pass

    def save(self) -> None:
        if not self._dirty:
            return
        learned = {c: n for c, n in self.names.items() if c not in BUILTIN}
        try:
            self.cache_file.write_text(json.dumps(learned, ensure_ascii=False, indent=0), encoding="utf-8")
            self._dirty = False
        except OSError:
            pass


def extract(text: str, resolver: Resolver, learn: bool = True) -> set[str]:
    """Return normalised stock codes mentioned in text."""
    found: set[str] = set()
    if not text:
        return found
    for m in re.finditer(r"(?i)(?<![a-z0-9])(sh|sz|bj)(\d{6})(?!\d)", text):
        found.add(m.group(1).lower() + m.group(2))
    for m in re.finditer(r"(?<!\d)(\d{6})\.(SH|SS|SZ|BJ|sh|ss|sz|bj)\b", text):
        ex = m.group(2).lower().replace("ss", "sh")
        found.add(ex + m.group(1))
    for m in re.finditer(r"(?i)(?<![a-z0-9])hk(\d{4,5})(?!\d)", text):
        found.add("hk" + m.group(1).zfill(5))
    for m in re.finditer(r"(?<![\d.])(\d{4,5})\.HK\b", text, re.I):
        found.add("hk" + m.group(1).zfill(5))
    # name（600519） / name(600519)
    for m in re.finditer(rf"({_CJK_NAME})\s*[（(]\s*(\d{{6}})\s*[)）]", text):
        if m.group(2) not in AMBIGUOUS_BARE:
            code = norm6(m.group(2))
            found.add(code)
            if learn:
                resolver.learn(code, m.group(1))
    # 600519-贵州茅台 / 600519 贵州茅台 / 600519_贵州茅台 (file names, tables)
    for m in re.finditer(rf"(?<![\d.])(\d{{6}})[-_ ]({_CJK_NAME})", text):
        if m.group(1) not in AMBIGUOUS_BARE:
            code = norm6(m.group(1))
            found.add(code)
            if learn:
                resolver.learn(code, re.sub(r"(研报|研究|笔记|简报|报告)$", "", m.group(2)))
    # bare 6-digit codes we already know
    known = set(resolver.names)
    for m in re.finditer(r"(?<![\d.,])(\d{6})(?![\d.,%])", text):
        if m.group(1) in AMBIGUOUS_BARE:
            continue
        code = norm6(m.group(1))
        if code in known:
            found.add(code)
    # names and aliases
    for name, code in resolver.name_index():
        if name in text:
            found.add(code)
    return {c for c in found if c not in INDEXES}
