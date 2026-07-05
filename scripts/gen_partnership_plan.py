#!/usr/bin/env python3
"""Generate the (customer-facing) partnership pricing plan PDF.

對外版：只列定價，不露內部毛利/分潤。
- 大衛營（推薦夥伴）：月費逐年遞減 5000 / 2500 / 1800（因介紹回饋，可一直降，最低標 1800）
- 新加入球場：標準定價，第一年 $3,600（含導入費），不適用遞減
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_OUT_DIR = os.path.join(_BASE, 'screenshots')
os.makedirs(_OUT_DIR, exist_ok=True)
OUTPUT = os.path.join(_OUT_DIR, '合作費用方案.pdf')

FONT = 'STSong-Light'
pdfmetrics.registerFont(UnicodeCIDFont(FONT))

# 供應商私章（公司大章 + 負責人小章）——使用者私人法定印章，不納入版控。
# 檔案存在才蓋章；不存在則留白簽章欄。
STAMP_COMPANY = os.environ.get('STAMP_COMPANY', '/Users/jef/文件MBP/scan/jeff/牛奶合約大章.png')
STAMP_PERSON = os.environ.get('STAMP_PERSON', '/Users/jef/文件MBP/scan/jeff/牛奶合約小章.png')

PW, PH = A4
M = 18 * mm


class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle('電子票券系統 合作費用方案')
        self.c.setAuthor('Milkidea')
        self.y = PH - M

    def title(self, text, size=22):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.1, 0.1, 0.1)
        self.c.drawCentredString(PW / 2, self.y, text)
        self.y -= size + 6

    def subtitle(self, text, size=10.5):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.drawCentredString(PW / 2, self.y, text)
        self.y -= size + 5

    def section(self, text, size=13):
        self.y -= 5 * mm
        self.c.setFillColorRGB(0.18, 0.35, 0.58)
        self.c.roundRect(M, self.y - 2, PW - 2 * M, size + 8, 3, fill=1, stroke=0)
        self.c.setFillColorRGB(1, 1, 1)
        self.c.setFont(FONT, size)
        self.c.drawString(M + 10, self.y + 2, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 14

    def trow(self, label, amount, bold=False, bg=None, header=False):
        h = 22
        if bg:
            self.c.setFillColorRGB(*bg)
            self.c.rect(M, self.y - 5, PW - 2 * M, h, fill=1, stroke=0)
        elif header:
            self.c.setFillColorRGB(0.94, 0.94, 0.94)
            self.c.rect(M, self.y - 5, PW - 2 * M, h, fill=1, stroke=0)
        self.c.setFont(FONT, 11 if (bold or header) else 10.5)
        self.c.setFillColorRGB(0.15, 0.15, 0.15) if not header else self.c.setFillColorRGB(0.3, 0.3, 0.3)
        self.c.drawString(M + 12, self.y + 2, label)
        self.c.setFont(FONT, 13 if bold else 11)
        self.c.setFillColorRGB(0.18, 0.35, 0.58) if bold else self.c.setFillColorRGB(0.15, 0.15, 0.15)
        self.c.drawRightString(PW - M - 12, self.y + 2, amount)
        self.c.setStrokeColorRGB(0.85, 0.85, 0.85)
        self.c.setLineWidth(0.3)
        self.c.line(M, self.y - 5, PW - M, self.y - 5)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= h

    def bullet(self, text, size=10, color=(0.3, 0.3, 0.3)):
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.circle(M + 11, self.y + 3, 1.9, fill=1, stroke=0)
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(M + 18, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 7

    def note(self, text, size=9.5, color=(0.45, 0.45, 0.45)):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(M + 4, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 6

    def spacer(self, h=4):
        self.y -= h

    def save(self):
        self.c.setFont(FONT, 8)
        self.c.setFillColorRGB(0.55, 0.55, 0.55)
        self.c.drawCentredString(PW / 2, 12 * mm, 'Milkidea  |  電子票券系統 合作費用方案')
        self.c.save()


def main():
    d = Doc(OUTPUT)
    d.spacer(10)
    d.title('電子票券系統　合作費用方案')
    d.subtitle('大衛營高爾夫球場')
    d.subtitle('2026 年 7 月 5 日')
    d.spacer(4)

    # 一、大衛營月費（逐年遞減）
    d.section('一、大衛營高爾夫球場　系統月費')
    d.trow('年度', '月費', header=True)
    d.trow('第 1 年', 'NT$ 5,000 / 月')
    d.trow('第 2 年起', 'NT$ 2,500 / 月（最低標）', bold=True, bg=(0.95, 0.98, 0.95))
    d.spacer(3)
    d.note('大衛營為推薦合作夥伴，月費隨介紹新球場簽約而調降；介紹越多、調降越快，最低標 NT$2,500 / 月。')

    # 二、新加入球場費用
    d.section('二、新加入球場　系統費用')
    d.trow('項目', '費用', header=True)
    d.trow('第一年（含系統導入費）', 'NT$ 3,600 / 月', bold=True, bg=(0.95, 0.97, 1.0))
    d.spacer(4)
    d.bullet('備註 1：第一年費用已含系統導入費。')
    d.bullet('備註 2：月租費為 NT$ 3,600 / 月。')
    d.bullet('備註 3：新加入球場為標準定價，不適用遞減優惠（遞減僅限推薦夥伴）。')

    # 三、合約條件
    d.section('三、合約條件')
    d.bullet('合約以月計算，第一年自 2026 年 7 月起至 2027 年 6 月底止（共 12 個月），第二、三年依此類推。')
    d.bullet('須簽訂保密條款，及特殊狀況處理原則。')
    d.bullet('硬體（平板 / 掃描設備）採購另計。')
    d.bullet('LINE 官方帳號推播費用由球場自行負擔。')
    d.bullet('本報價金額未含營業稅，開立發票時另加 5% 營業稅（稅外加）。')

    # 四、雙方簽署
    d.section('四、雙方簽署')
    c = d.c
    top = d.y - 2
    LX, RX = M + 12, PW / 2 + 12

    def put(dy, l_text, r_text, size=10.5, color=(0.2, 0.2, 0.2)):
        c.setFont(FONT, size)
        c.setFillColorRGB(*color)
        c.drawString(LX, top - dy, l_text)
        c.drawString(RX, top - dy, r_text)

    put(0, '系統供應商', '客戶', size=11, color=(0.18, 0.35, 0.58))
    put(22, '牛奶股份有限公司  MILK IDEA INC.', '買麥留有限公司（大衛營高爾夫球場）', size=10.5)
    put(42, '統一編號：53535550', '統一編號：53762013', size=9)
    put(60, '地址：台北市中正區忠孝西路一段45號9樓之5', '地址：高雄市旗山區大林里溝坪路98-3號', size=9)
    put(78, '電話：02-23711050　Email：jeff@milkidea.com', '電話：', size=9)
    put(102, '負責人：方乃正', '負責人：劉智慧', size=10.5)
    put(134, '簽章：', '簽章：', size=10.5)

    # 簽名底線
    c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.setLineWidth(0.6)
    c.line(LX + 36, top - 136, LX + 200, top - 136)
    c.line(RX + 36, top - 136, RX + 200, top - 136)

    # 客戶待填欄位底線（電話）
    c.setStrokeColorRGB(0.78, 0.78, 0.78)
    c.setLineWidth(0.4)
    c.line(RX + 36, top - 80, RX + 190, top - 80)   # 電話

    put(162, '日期：2026 年 7 月 5 日', '日期：2026 年 7 月 5 日', size=10)

    # 供應商用印（公司大章 + 負責人小章），蓋在方乃正簽章旁
    if os.path.exists(STAMP_COMPANY):
        c.drawImage(STAMP_COMPANY, 155, top - 158, width=56, height=56,
                    mask='auto', preserveAspectRatio=True)
    if os.path.exists(STAMP_PERSON):
        c.drawImage(STAMP_PERSON, 220, top - 150, width=42, height=42,
                    mask='auto', preserveAspectRatio=True)

    d.y = top - 185

    d.save()
    print(f'Saved: {OUTPUT}')


if __name__ == '__main__':
    main()
