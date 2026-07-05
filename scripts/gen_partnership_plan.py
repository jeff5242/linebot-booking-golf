#!/usr/bin/env python3
"""Generate the referral-partnership plan PDF (25% referral discount model)."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_OUT_DIR = os.path.join(_BASE, 'screenshots')
os.makedirs(_OUT_DIR, exist_ok=True)
OUTPUT = os.path.join(_OUT_DIR, '業務合作方案_25%介紹回饋.pdf')

FONT = 'STSong-Light'
pdfmetrics.registerFont(UnicodeCIDFont(FONT))

PW, PH = A4
M = 18 * mm


class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle('業務合作方案（25% 介紹回饋）')
        self.c.setAuthor('Milkidea')
        self.y = PH - M

    def title(self, text, size=21):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.1, 0.1, 0.1)
        self.c.drawCentredString(PW / 2, self.y, text)
        self.y -= size + 6

    def subtitle(self, text, size=10):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.drawCentredString(PW / 2, self.y, text)
        self.y -= size + 5

    def section(self, text, size=12):
        self.y -= 4 * mm
        self.c.setFillColorRGB(0.18, 0.35, 0.58)
        self.c.roundRect(M, self.y - 2, PW - 2 * M, size + 7, 3, fill=1, stroke=0)
        self.c.setFillColorRGB(1, 1, 1)
        self.c.setFont(FONT, size)
        self.c.drawString(M + 9, self.y + 2, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 12

    def bullet(self, text, size=9.5, color=(0.3, 0.3, 0.3)):
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.circle(M + 10, self.y + 3, 1.8, fill=1, stroke=0)
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(M + 17, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 6

    def trow(self, cells, cols, bold=False, bg=None, header=False, line=True):
        h = 19
        if bg:
            self.c.setFillColorRGB(*bg)
            self.c.rect(M, self.y - 4, PW - 2 * M, h, fill=1, stroke=0)
        elif header:
            self.c.setFillColorRGB(0.94, 0.94, 0.94)
            self.c.rect(M, self.y - 4, PW - 2 * M, h, fill=1, stroke=0)
        self.c.setFont(FONT, 9.5 if (bold or header) else 9)
        self.c.setFillColorRGB(0.15, 0.15, 0.15) if not header else self.c.setFillColorRGB(0.25, 0.25, 0.25)
        for txt, (x, w, align) in zip(cells, cols):
            if align == 'right':
                self.c.drawRightString(x + w, self.y + 2, txt)
            elif align == 'center':
                self.c.drawCentredString(x + w / 2, self.y + 2, txt)
            else:
                self.c.drawString(x, self.y + 2, txt)
        if line:
            self.c.setStrokeColorRGB(0.85, 0.85, 0.85)
            self.c.setLineWidth(0.3)
            self.c.line(M, self.y - 4, PW - M, self.y - 4)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= h

    def note(self, text, size=9, color=(0.45, 0.45, 0.45)):
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(M + 2, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 5

    def spacer(self, h=4):
        self.y -= h

    def save(self):
        self.c.setFont(FONT, 8)
        self.c.setFillColorRGB(0.55, 0.55, 0.55)
        self.c.drawCentredString(PW / 2, 10 * mm, 'Milkidea  |  電子票券系統 業務合作方案')
        self.c.save()


def main():
    d = Doc(OUTPUT)
    d.spacer(6)
    d.title('電子票券系統　業務合作方案')
    d.subtitle('25% 介紹回饋制　|　大衛營高爾夫球場')
    d.subtitle('2026 年 7 月 5 日')
    d.spacer(2)

    # 一、費用結構
    d.section('一、費用結構')
    d.bullet('系統營運服務費：NT$5,000 / 月（固定基準，對應營運成本 NT$4,120）')
    d.bullet('介紹回饋：每成功介紹 1 家球場 / 門市簽約並持續有效，月費 -25%（-$1,250）')
    d.bullet('月費最低標 $1,800（大衛營與各球場皆同）；被介紹方解約，對應折扣同步取消')
    d.bullet('被介紹之新球場：月費 $1,800 / 月')

    # 二、三年試算
    d.section('二、三年試算（假設每年介紹 2 家新球場）')
    C = [(M + 6, 70, 'left'), (M + 95, 70, 'center'),
         (M + 190, 95, 'right'), (M + 300, 95, 'right'), (M + 410, 68, 'right')]
    d.trow(['年度', '累計介紹', '大衛營月費', '新場月收入', '你的月毛利'], C, header=True)
    d.trow(['第 1 年', '0 家', '$5,000', '$0', '+$880'], C)
    d.trow(['第 2 年', '2 家', '$2,500', '$3,600', '+$1,980'], C)
    d.trow(['第 3 年', '4 家（達最低標）', '$1,800', '$7,200', '+$4,880'], C, bold=True, bg=(0.95, 0.98, 0.95))
    d.spacer(2)
    d.note('＊假設新增球場共用現有 EC2 / Supabase / Vercel，邊際維運成本 < $250 / 場．月。匯率 US$1 = NT$32。')

    # 三、與老師原案對照
    d.section('三、與原遞減方案對照（大衛營付一樣的錢，你從倒貼變獲利）')
    C2 = [(M + 6, 80, 'left'),
          (M + 95, 130, 'center'), (M + 230, 100, 'center'),
          (M + 335, 90, 'center'), (M + 430, 48, 'center')]
    d.trow(['年度', '原案 大衛營月費', '原案 你毛利', '本方案 大衛營', '本方案 毛利'], C2, header=True)
    d.trow(['第 1 年', '$5,000', '+$880', '$5,000', '+$880'], C2)
    d.trow(['第 2 年', '$2,000', '-$2,120', '$2,500', '+$1,980'], C2)
    d.trow(['第 3 年', '$1,000', '-$3,120', '$1,800', '+$4,880'], C2)
    d.trow(['三年合計', '—', '-$52,320', '—', '+$92,880'], C2, bold=True, bg=(0.95, 0.98, 0.95))
    d.spacer(2)
    d.note('關鍵：大衛營三年付的錢與原案相近，差別在「折扣由新客戶買單」——三年淨效益相差約 NT$145,000。')

    # 四、合作條款
    d.section('四、合作條款與前提')
    d.bullet('折扣僅於被介紹方「持續有效簽約」期間適用；對方解約，對應 25% 折扣即取消。')
    d.bullet('每場額外維運成本須控制在 $250 / 月以內，本方案毛利始成立。')
    d.bullet('LINE 官方帳號推播費用由各球場自行負擔；硬體（平板／掃描設備）另計；稅內含。')

    d.save()
    print(f'Saved: {OUTPUT}')


if __name__ == '__main__':
    main()
