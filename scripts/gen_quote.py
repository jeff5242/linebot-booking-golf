#!/usr/bin/env python3
"""Generate a professional quote PDF for the golf course voucher system."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
import os

# 輸出到 repo 的 screenshots/（此檔位於 scripts/ 時，上一層即專案根目錄）
_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_OUT_DIR = os.path.join(_BASE, 'screenshots')
os.makedirs(_OUT_DIR, exist_ok=True)
OUTPUT = os.path.join(_OUT_DIR, '電子票券系統報價單.pdf')
FONT = 'STSong-Light'
pdfmetrics.registerFont(UnicodeCIDFont(FONT))

PW, PH = A4
M = 20 * mm  # margin


def fmt_price(n):
    return f'${n:,}'


class QuoteDoc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle('電子票券系統開發報價單')
        self.c.setAuthor('Milkidea')
        self.y = PH - M
        self.page = 1

    def new_page(self):
        self.c.showPage()
        self.page += 1
        self.y = PH - M

    def check_space(self, needed):
        if self.y - needed < M + 10 * mm:
            self.new_page()

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
        self.check_space(30 * mm)
        self.y -= 6 * mm
        # section bar
        self.c.setFillColorRGB(0.18, 0.35, 0.58)
        self.c.roundRect(M, self.y - 2, PW - 2 * M, size + 8, 3, fill=1, stroke=0)
        self.c.setFillColorRGB(1, 1, 1)
        self.c.setFont(FONT, size)
        self.c.drawString(M + 10, self.y + 2, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 16

    def table_header(self, cols):
        """cols: [(text, x, width, align)]"""
        self.c.setFillColorRGB(0.94, 0.94, 0.94)
        self.c.rect(M, self.y - 4, PW - 2 * M, 18, fill=1, stroke=0)
        self.c.setFillColorRGB(0.2, 0.2, 0.2)
        self.c.setFont(FONT, 9)
        for text, x, w, align in cols:
            if align == 'right':
                self.c.drawRightString(x + w, self.y + 2, text)
            elif align == 'center':
                self.c.drawCentredString(x + w / 2, self.y + 2, text)
            else:
                self.c.drawString(x, self.y + 2, text)
        self.y -= 20

    def table_row(self, cols, bold=False, bg=None):
        """cols: [(text, x, width, align)]"""
        self.check_space(18)
        if bg:
            self.c.setFillColorRGB(*bg)
            self.c.rect(M, self.y - 4, PW - 2 * M, 18, fill=1, stroke=0)
        self.c.setFillColorRGB(0.15, 0.15, 0.15)
        self.c.setFont(FONT, 10 if bold else 9)
        for text, x, w, align in cols:
            if align == 'right':
                self.c.drawRightString(x + w, self.y + 2, text)
            elif align == 'center':
                self.c.drawCentredString(x + w / 2, self.y + 2, text)
            else:
                self.c.drawString(x, self.y + 2, text)
        # bottom line
        self.c.setStrokeColorRGB(0.88, 0.88, 0.88)
        self.c.setLineWidth(0.3)
        self.c.line(M, self.y - 4, PW - M, self.y - 4)
        self.y -= 18

    def total_row(self, label, amount):
        self.y -= 4
        self.c.setFillColorRGB(0.95, 0.97, 1.0)
        self.c.roundRect(M, self.y - 6, PW - 2 * M, 24, 3, fill=1, stroke=0)
        self.c.setFillColorRGB(0.15, 0.15, 0.15)
        self.c.setFont(FONT, 12)
        self.c.drawString(M + 10, self.y, label)
        self.c.setFont(FONT, 14)
        self.c.setFillColorRGB(0.18, 0.35, 0.58)
        self.c.drawRightString(PW - M - 10, self.y, amount)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= 30

    def text(self, text, size=10, indent=0, color=(0.25, 0.25, 0.25)):
        self.check_space(14)
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(*color)
        self.c.drawString(M + indent, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 5

    def bullet(self, text, size=9):
        self.check_space(14)
        self.c.setFillColorRGB(0.4, 0.4, 0.4)
        self.c.circle(M + 11, self.y + 3, 2, fill=1, stroke=0)
        self.c.setFont(FONT, size)
        self.c.setFillColorRGB(0.3, 0.3, 0.3)
        self.c.drawString(M + 18, self.y, text)
        self.c.setFillColorRGB(0, 0, 0)
        self.y -= size + 5

    def spacer(self, h=5):
        self.y -= h * mm

    def footer(self):
        self.c.setFont(FONT, 8)
        self.c.setFillColorRGB(0.55, 0.55, 0.55)
        self.c.drawCentredString(PW / 2, 12 * mm, f'Milkidea  |  電子票券系統開發報價單  |  第 {self.page} 頁')
        self.c.setFillColorRGB(0, 0, 0)

    def save(self):
        self.footer()
        self.c.save()


def main():
    d = QuoteDoc(OUTPUT)

    # ─── Cover / Header ───
    d.spacer(15)
    d.title('電子票券系統')
    d.title('開發報價單', 20)
    d.spacer(5)
    d.subtitle('大衛營高爾夫球場')
    d.subtitle('報價日期：2026 年 7 月 2 日')
    d.spacer(10)

    # ═══════════════════════════════════════
    # Value Analysis: Paper vs Digital
    # ═══════════════════════════════════════
    d.section('為什麼要導入電子票券？')

    d.text('貴球場目前使用紙本票券，約 1,000 位會員、每人約 48 張，合計約 48,000 張。', size=10, indent=4)
    d.text('以下比較紙本票券與電子票券在成本及效率上的差異：', size=10, indent=4)
    d.spacer(4)

    # Cost comparison table
    C_CAT  = (M + 4,   160)
    C_PPR  = (M + 170, 130)
    C_DIG  = (M + 310, 150)

    COLS_CMP = [
        ('比較項目', *C_CAT, 'left'),
        ('紙本票券', *C_PPR, 'center'),
        ('電子票券', *C_DIG, 'center'),
    ]
    d.table_header(COLS_CMP)

    def cmp_row(cat, paper, digital, bg=None):
        d.table_row([
            (cat, *C_CAT, 'left'),
            ('', M + 100, 10, 'left'),   # spacer
            (paper, *C_PPR, 'center'),
            ('', M + 250, 10, 'left'),   # spacer
            ('', M + 340, 58, 'right'),  # spacer
            (digital, *C_DIG, 'center'),
        ], bg=bg)

    cmp_row('印製 / 補發成本', '印製、補發需備料與工時', '免印製，發券即時完成', bg=(1.0, 0.97, 0.97))
    cmp_row('券量調整 / 續發', '須重新印製、等待備料', '系統即時增發，無須等待', bg=(1.0, 0.97, 0.97))
    cmp_row('人工核對 / 盤點', '每月人工清點、易出錯', '系統自動即時統計')
    cmp_row('報表整理', '人工 Excel 彙整', '一鍵產出各式報表')
    cmp_row('遺失 / 損毀風險', '易遺失損毀、補發爭議多', '不會遺失損毀、雲端備份')
    cmp_row('偽造風險', '難以查驗真偽', 'QR Code + 系統即時驗證')
    cmp_row('發券速度', '現場清點、蓋章耗時', '掃碼或搜尋，數秒完成')
    cmp_row('到期日管理', '人工逐筆追蹤', '系統自動提醒到期')
    cmp_row('客人查詢餘額', '需致電櫃檯詢問', 'LINE 隨時自助查詢')
    cmp_row('票券轉贈', '須實體交付、無從追蹤', 'LINE 一鍵轉贈、全程留痕')
    cmp_row('操作紀錄', '紙本登記、易遺漏', '完整稽核日誌可追溯')

    d.spacer(5)

    # Savings summary
    d.c.setFillColorRGB(0.95, 0.98, 0.95)
    d.c.roundRect(M, d.y - 8, PW - 2 * M, 52, 5, fill=1, stroke=0)
    d.c.setFillColorRGB(0.1, 0.4, 0.1)
    d.c.setFont(FONT, 11)
    d.c.drawString(M + 12, d.y + 28, '導入效益估算')
    d.c.setFont(FONT, 9)
    d.c.setFillColorRGB(0.2, 0.2, 0.2)
    d.c.circle(M + 16, d.y + 15, 2, fill=1, stroke=0)
    d.c.drawString(M + 22, d.y + 12, '每月節省約 8-12 小時人工核對 / 盤點 / 報表整理時間（年省約 100+ 小時）')
    d.c.circle(M + 16, d.y + 1, 2, fill=1, stroke=0)
    d.c.drawString(M + 22, d.y - 2, '防偽造、防遺失爭議，發券與餘額查詢即時化，會員體驗與服務品質提升')
    d.c.setFillColorRGB(0, 0, 0)
    d.y -= 60

    d.spacer(3)
    d.text('電子票券的核心效益在於人力成本節省、防偽防遺失、即時發券與會員自助查詢，', size=10, indent=4, color=(0.2, 0.2, 0.2))
    d.text('隨會員數與使用年數增加而持續累積，長期營運效益顯著。', size=10, indent=4, color=(0.2, 0.2, 0.2))

    d.footer()
    d.new_page()
    d.spacer(3)

    # table columns
    C_NO   = (M + 4,   22)    # 編號
    C_ITEM = (M + 28,  280)   # 項目（加寬）
    C_AMT  = (M + 405, 58)    # 金額

    COLS_H_SIMPLE = [
        ('編號', *C_NO, 'center'),
        ('項目說明', *C_ITEM, 'left'),
        ('金額', *C_AMT, 'right'),
    ]

    def row_simple(no, item, amt, bold=False, bg=None):
        d.table_row([
            (no, *C_NO, 'center'),
            (item, *C_ITEM, 'left'),
            ('', M + 310, 40, 'center'),  # spacer
            ('', M + 350, 40, 'center'),  # spacer
            ('', M + 340, 58, 'right'),   # spacer
            (amt, *C_AMT, 'right'),
        ], bold=bold, bg=bg)

    # ═══════════════════════════════════════
    # Section A: 系統開發導入費
    # ═══════════════════════════════════════
    d.section('一、系統開發與導入（一次性費用）')

    d.text('包含以下所有開發項目：', size=10, indent=4, color=(0.3, 0.3, 0.3))
    d.spacer(3)

    d.text('【裝置版本 UI 開發】', size=10, indent=4, color=(0.18, 0.35, 0.58))
    d.bullet('手機版介面（RWD 響應式設計、LINE LIFF 整合、觸控優化）')
    d.bullet('iPad 平板版介面（寬螢幕適配、橫向排版優化）')
    d.spacer(3)

    d.text('【電子票券功能】', size=10, indent=4, color=(0.18, 0.35, 0.58))
    d.bullet('套本發券（含續約判斷與效期自動計算）')
    d.bullet('核銷作業（快速選擇 2/4/6/8 張 + 金額計算）')
    d.bullet('撤銷核銷（逆流程作業）')
    d.bullet('全部退券 / 作廢（含原因記錄）')
    d.bullet('到期日管理（手動修改 + 紙券到期日轉換建議）')
    d.bullet('紙本票券資料匯入與轉換')
    d.bullet('客戶搜尋（姓名 / 電話 / 會員編號）')
    d.bullet('操作紀錄與稽核日誌')
    d.bullet('票券參數設定（套本設定、面額、效期）')
    d.bullet('條碼 / QR Code 掃描核銷')
    d.spacer(3)

    d.text('【報表管理與生成】', size=10, indent=4, color=(0.18, 0.35, 0.58))
    d.bullet('票券銷售報表（依期間 / 套本 / 客戶）')
    d.bullet('核銷統計報表（日報 / 月報 / 年報）')
    d.bullet('客戶票券餘額總覽')
    d.bullet('到期預警報表（即將到期通知）')
    d.bullet('報表匯出（Excel / PDF）')
    d.spacer(5)

    d.total_row('系統開發與導入（原價）', fmt_price(360000))

    # Discount
    d.c.setFillColorRGB(0.92, 0.96, 1.0)
    d.c.roundRect(M, d.y - 6, PW - 2 * M, 28, 4, fill=1, stroke=0)
    d.c.setFont(FONT, 12)
    d.c.setFillColorRGB(0.75, 0.15, 0.15)
    d.c.drawString(M + 10, d.y + 4, '首批導入專案優惠')
    d.c.setFont(FONT, 14)
    d.c.setFillColorRGB(0.18, 0.35, 0.58)
    d.c.drawRightString(PW - M - 10, d.y + 2, fmt_price(88000))
    d.c.setFillColorRGB(0, 0, 0)
    d.y -= 36

    # ═══════════════════════════════════════
    # Section B: 月費營運
    # ═══════════════════════════════════════
    d.section('二、每月營運服務費')

    C_SVC  = (M + 4,   22)
    C_DESC = (M + 28,  330)
    C_MAMT = (M + 405, 58)

    COLS_H_SVC = [
        ('編號', *C_SVC, 'center'),
        ('服務項目', *C_DESC, 'left'),
        ('月費', *C_MAMT, 'right'),
    ]

    d.table_header(COLS_H_SVC)

    def svc_row(no, item, amt, bold=False, bg=None):
        d.table_row([
            (no, *C_SVC, 'center'),
            (item, *C_DESC, 'left'),
            ('', M + 258, 40, 'center'),
            ('', M + 302, 35, 'center'),
            ('', M + 340, 58, 'right'),
            (amt, *C_MAMT, 'right'),
        ], bold=bold, bg=bg)

    svc_row('1', '雲端主機代管（含 SSL 憑證、每日自動備份、監控）', '含')
    svc_row('2', '系統維護與更新（Bug 修復、安全性更新）', '含')
    svc_row('3', '技術支援（工作日 09:00-18:00）', '含')
    svc_row('4', '資料庫備份與災難復原', '含')
    svc_row('5', '報表管理與生成', '含')
    d.spacer(2)
    d.total_row('每月營運服務費', fmt_price(6800) + ' / 月')

    d.spacer(8)

    # ═══════════════════════════════════════
    # Grand total
    # ═══════════════════════════════════════
    d.section('費用總覽')

    svc_row('一', '系統開發與導入（優惠價）', fmt_price(88000), bold=True, bg=(0.97, 0.97, 1.0))
    svc_row('二', '每月營運服務費 × 12 個月', fmt_price(81600), bold=True, bg=(0.97, 0.97, 1.0))
    d.spacer(2)
    d.total_row('首年總費用', fmt_price(169600))

    d.spacer(3)
    d.text('第二年起，僅需支付每月營運服務費 $6,800（年費 $81,600）', size=10, indent=4, color=(0.3, 0.3, 0.3))
    d.spacer(2)
    d.text('相較紙本票券的人工盤點、補發爭議與偽造風險，', size=9, indent=4, color=(0.45, 0.45, 0.45))
    d.text('導入電子票券可大幅降低長期人力與管理成本，並提升會員服務品質。', size=9, indent=4, color=(0.45, 0.45, 0.45))

    d.spacer(12)

    # ═══════════════════════════════════════
    # Notes
    # ═══════════════════════════════════════
    d.section('備註與合約條件')

    d.text('【付款方式】', size=10, color=(0.15, 0.15, 0.15))
    d.bullet('開發導入費：簽約時一次付清')
    d.bullet('營運服務費：按月支付')
    d.spacer(3)

    d.text('【合約期間】', size=10, color=(0.15, 0.15, 0.15))
    d.bullet('最低簽約期間：12 個月')
    d.bullet('到期後可續約，費用另議')
    d.spacer(3)

    d.text('【服務範圍】', size=10, color=(0.15, 0.15, 0.15))
    d.bullet('月費包含：主機代管、SSL、每日備份、系統安全更新、工作日技術支援')
    d.bullet('月費不包含：新功能開發需求（另行報價）')
    d.spacer(3)

    d.text('【報價有效期】', size=10, color=(0.15, 0.15, 0.15))
    d.bullet('本報價自報價日起 30 日內有效')
    d.spacer(3)

    d.text('【其他說明】', size=10, color=(0.15, 0.15, 0.15))
    d.bullet('以上報價不含營業稅')
    d.bullet('需求變更超出原始規格時，另行報價')

    d.footer()
    d.save()
    print(f'Quote saved: {OUTPUT}')


if __name__ == '__main__':
    main()
