#!/usr/bin/env python3
"""Generate a standalone Server / operating-fee quote PDF (fixed monthly, non-declining)."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

# 輸出到 repo 的 screenshots/（此檔位於 scripts/ 時，上一層即專案根目錄）
_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_OUT_DIR = os.path.join(_BASE, 'screenshots')
os.makedirs(_OUT_DIR, exist_ok=True)
OUTPUT = os.path.join(_OUT_DIR, '系統營運服務費報價單.pdf')

FONT = 'STSong-Light'
pdfmetrics.registerFont(UnicodeCIDFont(FONT))

PW, PH = A4
M = 20 * mm


class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle('系統營運服務費報價單')
        self.c.setAuthor('Milkidea')
        self.y = PH - M

    def title(self, text, size=24):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.1, 0.1, 0.1)
        self.c.drawCentredString(PW / 2, self.y, text)
        self.y -= size + 8

    def subtitle(self, text, size=11):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.drawCentredString(PW / 2, self.y, text)
        self.y -= size + 6

    def section(self, text, size=14):
        self.y -= 6 * mm
        self.c.setFillColorRGB(0.18, 0.35, 0.58)
        self.c.roundRect(M, self.y - 2, PW - 2 * M, size + 8, 3, fill=1, stroke=0)
        self.c.setFillColorRGB(1, 1, 1)
        self.c.setFont(FONT, size)
        self.c.drawString(M + 10, self.y + 2, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 16

    def row(self, item, desc, amt, bold=False, bg=None, top_line=False):
        if bg:
            self.c.setFillColorRGB(*bg)
            self.c.rect(M, self.y - 4, PW - 2 * M, 20, fill=1, stroke=0)
        self.c.setFillColorRGB(0.15, 0.15, 0.15)
        self.c.setFont(FONT, 11 if bold else 10)
        self.c.drawString(M + 8, self.y + 2, item)
        self.c.setFont(FONT, 9)
        self.c.setFillColorRGB(0.45, 0.45, 0.45)
        self.c.drawString(M + 150, self.y + 2, desc)
        self.c.setFont(FONT, 12 if bold else 10)
        self.c.setFillColorRGB(0.18, 0.35, 0.58) if bold else self.c.setFillColorRGB(0.15, 0.15, 0.15)
        self.c.drawRightString(PW - M - 10, self.y + 2, amt)
        self.c.setStrokeColorRGB(0.85, 0.85, 0.85)
        self.c.setLineWidth(0.6 if top_line else 0.3)
        self.c.line(M, self.y - 4, PW - M, self.y - 4)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= 20

    def big_fee(self, label, amt):
        self.y -= 6
        self.c.setFillColorRGB(0.95, 0.97, 1.0)
        self.c.roundRect(M, self.y - 8, PW - 2 * M, 34, 5, fill=1, stroke=0)
        self.c.setFillColorRGB(0.15, 0.15, 0.15)
        self.c.setFont(FONT, 13)
        self.c.drawString(M + 12, self.y + 4, label)
        self.c.setFont(FONT, 20)
        self.c.setFillColorRGB(0.18, 0.35, 0.58)
        self.c.drawRightString(PW - M - 12, self.y + 2, amt)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= 42

    def text(self, text, size=10, indent=0, color=(0.25, 0.25, 0.25)):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(M + indent, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 6

    def bullet(self, text, size=9.5):
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.circle(M + 11, self.y + 3, 2, fill=1, stroke=0)
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.3, 0.3, 0.3)
        self.c.drawString(M + 18, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 7

    def spacer(self, h=5):
        self.y -= h * mm

    def save(self):
        self.c.setFont(FONT, 8)
        self.c.setFillColorRGB(0.55, 0.55, 0.55)
        self.c.drawCentredString(PW / 2, 12 * mm, 'Milkidea  |  系統營運服務費報價單')
        self.c.save()


def main():
    d = Doc(OUTPUT)

    d.spacer(12)
    d.title('系統營運服務費')
    d.title('報價單', 20)
    d.spacer(4)
    d.subtitle('大衛營高爾夫球場')
    d.subtitle('報價日期：2026 年 7 月 5 日')
    d.spacer(8)

    # 每月營運成本明細
    d.section('每月營運成本明細')

    # header
    d.c.setFillColorRGB(0.94, 0.94, 0.94)
    d.c.rect(M, d.y - 4, PW - 2 * M, 18, fill=1, stroke=0)
    d.c.setFillColorRGB(0.2, 0.2, 0.2)
    d.c.setFont(FONT, 9)
    d.c.drawString(M + 8, d.y + 2, '項目')
    d.c.drawString(M + 150, d.y + 2, '說明')
    d.c.drawRightString(PW - M - 10, d.y + 2, '月費 (NT$)')
    d.c.setFillColorRGB(0, 0, 0)
    d.y -= 22

    d.row('EC2 雲端主機', '後端 API 24 小時常駐運作', '1,000')
    d.row('Supabase 資料庫', 'US$25 × 32，含每日自動備份', '800')
    d.row('Vercel 前端託管', 'US$10 × 32', '320')
    d.row('系統維運', '工程師每月 2 小時線上維護', '2,000')
    d.row('營運成本合計', '（成本，未含毛利）', '4,120', bold=True, bg=(0.97, 0.97, 1.0), top_line=True)

    d.spacer(4)

    # 固定月費
    d.big_fee('系統營運服務費（固定月費）', 'NT$ 5,000 / 月')

    d.spacer(2)

    # 說明
    d.section('費用說明')
    d.bullet('本費用為系統持續運作的固定營運成本，只要系統上線即持續產生、不隨開發費攤提遞減。')
    d.bullet('系統開發費用另行計算（一次性或前期攤提），不包含於本營運服務費。')
    d.bullet('球場因故暫停營業期間，主機與資料庫仍持續運作，本營運費仍須支付。')
    d.bullet('LINE 官方帳號推播費用依球場 LINE 方案由球場自行負擔，不含於本報價。')
    d.bullet('本報價以匯率 US$1 = NT$32 計算，若匯率大幅波動得另行調整。')
    d.bullet('稅內含。')

    d.save()
    print(f'Saved: {OUTPUT}')


if __name__ == '__main__':
    main()
