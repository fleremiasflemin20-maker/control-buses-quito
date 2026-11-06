# -*- coding: utf-8 -*-
"""Genera el Manual de instalación a bordo (DOCX) con diagramas.

Uso:
  python build_manual.py
Salida:
  Manual-Instalacion-a-Bordo.docx
"""

import os
from datetime import date

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(BASE, "img")
os.makedirs(IMG_DIR, exist_ok=True)

INK = (15, 23, 42)
SLATE = (51, 65, 85)
GRAY = (100, 116, 139)
AMBER = (217, 119, 6)
AMBER_LIGHT = (255, 247, 230)
BLUE = (3, 105, 161)
GREEN = (21, 128, 61)
RED = (185, 28, 28)
PAPER = (248, 250, 252)
WHITE = (255, 255, 255)

INK_C = RGBColor(*INK)
AMBER_C = RGBColor(*AMBER)
GRAY_C = RGBColor(*GRAY)
SLATE_C = RGBColor(*SLATE)

FONT_DIR = "C:/Windows/Fonts"


def _font(name, size):
    for candidate in (name, "arial.ttf"):
        path = os.path.join(FONT_DIR, candidate)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def F(size, bold=False):
    return _font("segoeuib.ttf" if bold else "segoeui.ttf", size)


# ───────────────────────────── diagramas ─────────────────────────────

def arrow(draw, x1, y1, x2, y2, color=GRAY, width=3):
    draw.line((x1, y1, x2, y2), fill=color, width=width)
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    size = 14
    p1 = (x2 - size * math.cos(ang - 0.42), y2 - size * math.sin(ang - 0.42))
    p2 = (x2 - size * math.cos(ang + 0.42), y2 - size * math.sin(ang + 0.42))
    draw.polygon([(x2, y2), p1, p2], fill=color)


def box(draw, x, y, w, h, title, subtitle="", fill=WHITE, outline=(203, 213, 225), accent=AMBER, title_size=26):
    draw.rounded_rectangle((x, y, x + w, y + h), radius=16, fill=fill, outline=outline, width=3)
    draw.rectangle((x, y, x + 10, y + h), fill=accent)
    draw.rounded_rectangle((x, y, x + 12, y + h), radius=6, fill=accent)
    draw.text((x + 26, y + 16), title, font=F(title_size, True), fill=INK)
    if subtitle:
        body = max(18, title_size - 8)
        draw.multiline_text((x + 26, y + 16 + title_size + 10), subtitle, font=F(body), fill=GRAY, spacing=8)


def make_architecture(path):
    W, H = 1600, 640
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    d.text((40, 24), "Arquitectura a bordo y enlace con la central", font=F(34, True), fill=INK)
    d.line((40, 74, 1560, 74), fill=(226, 232, 240), width=3)
    d.text((40, 90), "El video se procesa en el bus; a la central solo viajan eventos y metadatos.", font=F(21), fill=GRAY)

    box(d, 40, 140, 240, 120, "Cámaras", "4 canales 1080p IR", accent=AMBER, title_size=30)
    box(d, 330, 140, 230, 120, "MDVR", "SSD 1 TB · 15 días", accent=BLUE, title_size=30)
    box(d, 610, 140, 260, 120, "Gateway IA", "conteo · alertas", accent=AMBER, title_size=30)
    box(d, 920, 140, 200, 120, "Router 4G", "dual SIM · VPN", accent=BLUE, title_size=30)

    box(d, 1170, 110, 390, 320, "Central de control", "", fill=(239, 246, 255), accent=BLUE, title_size=32)
    lines = [
        "· Ingesta MQTT / HTTPS",
        "· PostgreSQL + PostGIS",
        "· TimescaleDB (telemetría)",
        "· S3 / MinIO (clips)",
        "· Reglas y alertas",
        "· Panel, app y reportes",
    ]
    for i, line in enumerate(lines):
        d.text((1200, 184 + i * 38), line, font=F(22), fill=INK)

    box(d, 610, 350, 260, 110, "Telemetría", "CAN · GPS · ignición", accent=GREEN, title_size=26)
    box(d, 40, 350, 240, 110, "UPS / DC-DC", "12 V · 5 A", accent=RED, title_size=26)

    arrow(d, 280, 200, 325, 200, GRAY)
    arrow(d, 560, 200, 605, 200, GRAY)
    arrow(d, 870, 200, 915, 200, AMBER)
    arrow(d, 1120, 200, 1165, 200, AMBER)
    arrow(d, 740, 350, 740, 265, GREEN)
    d.text((752, 300), "CAN/GPS", font=F(19), fill=GRAY)

    d.text((40, 470), "Flujo: cámaras → RTSP → MDVR → video → Gateway IA → MQTT/TLS → router 4G → central.",
           font=F(20), fill=SLATE)
    d.text((40, 505), "Alimentación 12 V desde la UPS/DC-DC al MDVR, Jetson y router (cableado no representado).",
           font=F(20), fill=SLATE)
    d.text((40, 538), "Si se pierde la señal, el bus sigue grabando y encola eventos para sincronizar al recuperar cobertura.",
           font=F(20), fill=SLATE)

    img.save(path, quality=92)



def make_mounting(path):
    W, H = 1500, 880
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    d.text((40, 24), "Ubicación de cámaras — vista superior del bus", font=F(34, True), fill=INK)
    d.line((40, 74, 1460, 74), fill=(226, 232, 240), width=3)

    bx, by, bw, bh = 60, 210, 1380, 360
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=50, fill=WHITE, outline=INK, width=5)
    d.arc((bx - 18, by + 18, bx + 160, by + bh - 18), 90, 270, fill=BLUE, width=8)

    d.rectangle((bx + 300, by + bh - 12, bx + 400, by + bh + 12), fill=AMBER)
    d.text((bx + 300, by + bh + 16), "puerta", font=F(18), fill=AMBER)

    d.ellipse((bx + 80, by + 35, bx + 165, by + 120), outline=GRAY, width=4)
    d.text((bx + 78, by + 128), "conductor", font=F(18), fill=GRAY)

    for row in range(4):
        for col in range(3):
            sx = bx + 430 + col * 300
            sy = by + 55 + row * 72
            d.rounded_rectangle((sx, sy, sx + 95, sy + 40), radius=9, fill=(226, 232, 240))

    # 1 frontal
    d.polygon([(bx + 105, by + 25), (bx + 520, by + 10), (bx + 520, by + 185)], fill=(253, 230, 138))
    d.ellipse((bx + 95, by + 15, bx + 122, by + 42), fill=AMBER)
    d.text((bx + 80, by - 38), "1  Frontal", font=F(24, True), fill=INK)

    # 2 conductor
    d.polygon([(bx + 195, by + 70), (bx + 470, by + 35), (bx + 470, by + 215)], fill=(254, 215, 170))
    d.ellipse((bx + 185, by + 60, bx + 212, by + 87), fill=AMBER)
    d.text((bx + 196, by + 228), "2  Conductor", font=F(24, True), fill=INK)

    # 3 puerta
    d.polygon([(bx + 350, by + bh - 35), (bx + 640, by + bh - 8), (bx + 640, by + 250)], fill=(191, 219, 254))
    d.ellipse((bx + 340, by + bh - 47, bx + 367, by + bh - 20), fill=AMBER)
    d.text((bx + 405, by + bh + 50), "3  Puerta", font=F(24, True), fill=INK)

    # 4 salón
    d.polygon([(bx + 700, by + 55), (bx + 1355, by + 20), (bx + 1355, by + 330)], fill=(187, 247, 208))
    d.ellipse((bx + 690, by + 45, bx + 717, by + 72), fill=AMBER)
    d.text((bx + 745, by - 38), "4  Salón", font=F(24, True), fill=INK)

    d.text((40, 640), "Referencias", font=F(26, True), fill=INK)
    legend = [
        ("1", "Frontal: detrás del espejo retrovisor, 1,95–2,10 m, inclinación −5°."),
        ("2", "Conductor: pilar A, 1,55–1,65 m, apuntando al rostro, con IR."),
        ("3", "Puerta: sobre el marco, 2,05–2,15 m, inclinación 30–40° hacia abajo."),
        ("4", "Salón: techo parte delantera mirando hacia atrás, 2,15–2,25 m."),
    ]
    for i, (n, text) in enumerate(legend):
        y = 672 + i * 40
        d.ellipse((40, y + 1, 70, y + 31), fill=AMBER)
        d.text((48, y + 6), n, font=F(18, True), fill=WHITE)
        d.text((88, y + 3), text, font=F(21), fill=INK)

    d.text((40, 848), "Los conos son referenciales: validar el campo de visión en patio antes de fijar las cámaras.",
           font=F(17), fill=GRAY)

    img.save(path, quality=92)


ARCH = os.path.join(IMG_DIR, "arquitectura.png")
MOUNT = os.path.join(IMG_DIR, "montaje.png")
make_architecture(ARCH)
make_mounting(MOUNT)


# ───────────────────────────── utilidades DOCX ─────────────────────────────

def shade(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def cell_margins(table, top=80, bottom=80, left=120, right=120):
    tbl_pr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for side, value in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")
        mar.append(node)
    tbl_pr.append(mar)


def set_col_widths(table, widths):
    table.autofit = False
    tbl = table._tbl
    tbl_pr = tbl.tblPr

    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tbl_pr.append(layout)

    total = sum(int(w.twips) for w in widths)
    tbl_w = OxmlElement("w:tblW")
    tbl_w.set(qn("w:w"), str(total))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_pr.append(tbl_w)

    grid = tbl.tblGrid
    for i, width in enumerate(widths):
        if i < len(grid.gridCol_lst):
            grid.gridCol_lst[i].set(qn("w:w"), str(int(width.twips)))

    for row in table.rows:
        for i, width in enumerate(widths):
            row.cells[i].width = width


def p(doc, text="", size=10.5, bold=False, color=INK_C, space_after=6, align=None, italic=False):
    par = doc.add_paragraph()
    par.paragraph_format.space_after = Pt(space_after)
    par.paragraph_format.line_spacing = 1.18
    if align is not None:
        par.alignment = align
    run = par.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = color
    return par


def bullets(doc, items, size=10.5):
    for item in items:
        par = doc.add_paragraph(style="List Bullet")
        par.paragraph_format.space_after = Pt(3)
        run = par.add_run(item)
        run.font.size = Pt(size)
        run.font.color.rgb = INK_C


def h1(doc, number, text):
    par = doc.add_paragraph()
    par.paragraph_format.space_before = Pt(16)
    par.paragraph_format.space_after = Pt(6)
    par.paragraph_format.keep_with_next = True
    run = par.add_run(f"{number}.  {text}" if number else text)
    run.font.size = Pt(17)
    run.bold = True
    run.font.color.rgb = INK_C
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "12")
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), "D97706")
    border.append(bottom)
    par._p.get_or_add_pPr().append(border)


def h2(doc, text):
    par = doc.add_paragraph()
    par.paragraph_format.space_before = Pt(10)
    par.paragraph_format.space_after = Pt(3)
    par.paragraph_format.keep_with_next = True
    run = par.add_run(text)
    run.font.size = Pt(12.5)
    run.bold = True
    run.font.color.rgb = AMBER_C


def table(doc, headers, rows, widths, header_bg="0F172A", zebra="F1F5F9", size=9, bold_last=False):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell_margins(t)
    hdr = t.rows[0].cells
    for i, head in enumerate(headers):
        hdr[i].text = ""
        par = hdr[i].paragraphs[0]
        run = par.add_run(head)
        run.bold = True
        run.font.size = Pt(size)
        run.font.color.rgb = RGBColor(255, 255, 255)
        shade(hdr[i], header_bg)
    for r_i, row in enumerate(rows):
        cells = t.add_row().cells
        for c_i, value in enumerate(row):
            cells[c_i].text = ""
            par = cells[c_i].paragraphs[0]
            par.paragraph_format.space_after = Pt(0)
            run = par.add_run(str(value))
            run.font.size = Pt(size)
            if bold_last and r_i == len(rows) - 1:
                run.bold = True
            if zebra and r_i % 2 == 1:
                shade(cells[c_i], zebra)
    tr_pr = t.rows[0]._tr.get_or_add_trPr()
    th = OxmlElement("w:tblHeader")
    th.set(qn("w:val"), "true")
    tr_pr.append(th)
    for row in t.rows:
        row_pr = row._tr.get_or_add_trPr()
        cs = OxmlElement("w:cantSplit")
        cs.set(qn("w:val"), "true")
        row_pr.append(cs)
    if len(rows) <= 8:
        for row in t.rows[:-1]:
            for cell in row.cells:
                for par in cell.paragraphs:
                    par.paragraph_format.keep_with_next = True
    set_col_widths(t, widths)
    return t


def callout(doc, title, text, fill="FFF7E6", border="D97706"):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.rows[0].cells[0]
    cell.text = ""
    shade(cell, fill)
    par = cell.paragraphs[0]
    par.paragraph_format.space_after = Pt(2)
    r1 = par.add_run(title + "  ")
    r1.bold = True
    r1.font.size = Pt(10)
    r1.font.color.rgb = AMBER_C
    r2 = par.add_run(text)
    r2.font.size = Pt(10)
    r2.font.color.rgb = INK_C
    cell_margins(t, 120, 120, 160, 160)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def caption(doc, text):
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.paragraph_format.space_after = Pt(10)
    run = par.add_run(text)
    run.font.size = Pt(8.5)
    run.italic = True
    run.font.color.rgb = GRAY_C


def add_page_number(par):
    run = par.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)
    run.font.size = Pt(8)
    run.font.color.rgb = GRAY_C


# ───────────────────────────── documento ─────────────────────────────

doc = Document()
section = doc.sections[0]
section.page_height = Cm(29.7)
section.page_width = Cm(21)
section.top_margin = Cm(2.1)
section.bottom_margin = Cm(1.9)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.2)

normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")

# encabezado y pie
header = section.header
hp = header.paragraphs[0]
hp.text = ""
hr = hp.add_run("CONTROL DE FLOTA · QUITO")
hr.font.size = Pt(8)
hr.font.color.rgb = GRAY_C
hr.bold = True
hp.add_run("\t\t")
hr2 = hp.add_run("Manual de instalación a bordo · v1.0")
hr2.font.size = Pt(8)
hr2.font.color.rgb = GRAY_C

footer = section.footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
run = fp.add_run("Página ")
run.font.size = Pt(8)
run.font.color.rgb = GRAY_C
add_page_number(fp)

# ── portada
for _ in range(3):
    doc.add_paragraph()

p(doc, "PROYECTO PILOTO · 10 BUSES", 10, True, AMBER_C, space_after=10)
title = doc.add_paragraph()
title.paragraph_format.space_after = Pt(4)
tr = title.add_run("Manual de instalación\na bordo")
tr.font.size = Pt(38)
tr.bold = True
tr.font.color.rgb = INK_C

p(doc, "Cámaras, telemetría y cómputo en el vehículo para el centro de control de flota de Quito",
  12, False, SLATE_C, space_after=24)

line = doc.add_table(rows=1, cols=1)
line.autofit = False
cell = line.rows[0].cells[0]
shade(cell, "D97706")
cell.text = ""
cell.paragraphs[0].add_run(" ").font.size = Pt(6)

doc.add_paragraph()
meta = [
    ("Versión", "1.0 — documento de trabajo para el piloto"),
    ("Fecha", date.today().strftime("%d/%m/%Y")),
    ("Alcance", "10 buses · 4 cámaras por bus · 1 centro de control"),
    ("Elaborado para", "Operadora de transporte urbano — Quito, Ecuador"),
    ("Documentos relacionados", "Blueprint del sistema · Prototipo de centro de control"),
]
table(doc, ["Campo", "Detalle"], meta, [Cm(4.6), Cm(11.8)], size=9)

doc.add_page_break()

# ── contenido
h1(doc, "", "Contenido")
toc = [
    ("1", "Resumen ejecutivo"),
    ("2", "Alcance del piloto y criterios de éxito"),
    ("3", "Arquitectura del sistema a bordo"),
    ("4", "Selección de hardware y lista de materiales"),
    ("5", "Alimentación, cableado y red"),
    ("6", "Ubicación y montaje de las cámaras"),
    ("7", "Configuración del software a bordo"),
    ("8", "Procedimiento de instalación paso a paso"),
    ("9", "Pruebas de aceptación"),
    ("10", "Operación y mantenimiento"),
    ("11", "Costos del piloto"),
    ("12", "Seguridad, normativa y privacidad"),
    ("13", "Riesgos y mitigaciones"),
    ("A", "Anexo A — Parámetros de configuración"),
    ("B", "Anexo B — Acta de entrega del bus"),
]
for num, text in toc:
    par = doc.add_paragraph()
    par.paragraph_format.space_after = Pt(4)
    r1 = par.add_run(f"{num}.\t")
    r1.bold = True
    r1.font.size = Pt(10.5)
    r1.font.color.rgb = AMBER_C
    r2 = par.add_run(text)
    r2.font.size = Pt(10.5)
    r2.font.color.rgb = INK_C

h2(doc, "Cómo usar este manual")
p(doc, "El manual está pensado para tres lectores. El taller encuentra en las secciones 4 a 8 la "
       "lista de materiales, el cableado, la ubicación de cámaras y el procedimiento completo. El "
       "supervisor de flota y el área legal usan las secciones 9 y 12 para aceptar el bus y verificar "
       "el cumplimiento de privacidad. La gerencia encuentra el alcance, los indicadores y los costos "
       "en las secciones 2 y 11.")
bullets(doc, [
    "Antes de comprar: validar modelos y precios con al menos dos cotizaciones locales.",
    "Antes de instalar: confirmar el tipo de bus, la ubicación de la caja de fusibles y la ruta del arnés.",
    "Después de instalar: completar el acta del Anexo B y cargar el bus al sistema con su identificador.",
])

doc.add_page_break()

# ── 1 resumen
h1(doc, "1", "Resumen ejecutivo")
p(doc, "Este manual describe cómo equipar un bus urbano de Quito con cuatro cámaras, un grabador "
       "digital (MDVR), un gateway de telemetría y un computador de borde con inteligencia artificial, "
       "de modo que el vehículo entregue al centro de control conteo de pasajeros, eventos de seguridad, "
       "ubicación y estado mecánico sin transmitir video continuo.")
p(doc, "El piloto cubre diez buses y busca demostrar tres cosas antes de escalar a toda la flota: "
       "(1) que el conteo automático alcanza al menos 95 % de exactitud frente a un aforo manual; "
       "(2) que una alerta crítica llega a la central en menos de 10 segundos; y (3) que la instalación "
       "resiste la operación diaria de 16 horas sin fallas de alimentación ni de conectividad.")
callout(doc, "Decisión clave:", "procesar el video dentro del bus. Subir cuatro canales en vivo consumiría "
        "entre 60 y 120 GB por bus al día; con cómputo de borde el consumo baja a decenas de megabytes "
        "y solo se transmiten clips cuando ocurre un evento.")
p(doc, "El documento está dirigido al taller de la operadora y a la empresa instaladora. Incluye lista "
       "de materiales con modelos y precios de referencia, diagramas de conexión, ubicación de cámaras, "
       "procedimiento paso a paso, pruebas de aceptación, mantenimiento y costos del piloto.")

# ── 2 alcance
h1(doc, "2", "Alcance del piloto y criterios de éxito")
h2(doc, "2.1 Alcance")
bullets(doc, [
    "10 buses representativos: 4 de piso alto (troncal), 4 de piso bajo (alimentador) y 2 con ruta larga al valle.",
    "4 cámaras por bus: puerta delantera, conductor, salón y frontal.",
    "MDVR con 1 TB de almacenamiento y buffer mínimo de 15 días para video continuo.",
    "Gateway de telemetría con lectura CAN, GPS y señal de ignición.",
    "Gateway de IA para conteo de pasajeros, detección de somnolencia y clips automáticos.",
    "Conectividad 4G LTE con doble SIM y VPN hacia la central.",
    "Integración con el prototipo de centro de control (alertas, aforo por parada, histórico).",
])
h2(doc, "2.2 Fuera de alcance en esta fase")
bullets(doc, [
    "Reconocimiento facial de pasajeros (no se implementará: dato biométrico innecesario para el conteo).",
    "Audio ambiente en el salón (solo se admite audio en la cámara del conductor si la política laboral lo autoriza).",
    "Cobro o validación tarifaria: el sistema se integra con el validador existente, no lo reemplaza.",
    "Analítica predictiva de mantenimiento: se recogen los datos, pero el modelo se desarrolla en la fase 2.",
])
h2(doc, "2.3 Criterios de éxito medibles")
table(doc, ["Indicador", "Meta", "Cómo se mide"], [
    ["Exactitud de conteo", "≥ 95 %", "Aforo manual simultáneo en 3 franjas horarias, 2 días"],
    ["Latencia de alerta crítica", "< 10 s", "Marca de tiempo del evento vs. recepción en la central"],
    ["Disponibilidad del equipo", "≥ 98 %", "Horas con video y GPS válidos / horas de servicio"],
    ["Continuidad de video", "≥ 15 días", "Verificación aleatoria de clips históricos"],
    ["Consumo de datos", "≤ 150 MB/bus/día", "Reporte de la operadora móvil"],
    ["Instalación por bus", "≤ 6 horas", "Dos técnicos, jornada completa"],
], [Cm(4.4), Cm(3.0), Cm(9.0)])

# ── 3 arquitectura
h1(doc, "3", "Arquitectura del sistema a bordo")
p(doc, "La arquitectura separa tres responsabilidades: grabar siempre, analizar a bordo y transmitir lo "
       "relevante. Si falla la conectividad, el bus sigue grabando y encolando eventos; cuando recupera "
       "señal, sincroniza sin intervención humana.")
doc.add_picture(ARCH, width=Cm(16.6))
doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
caption(doc, "Figura 1. Arquitectura de referencia: cámaras, MDVR, gateway de IA, telemetría y enlace 4G.")

h2(doc, "3.1 Flujo de datos")
table(doc, ["Origen", "Destino", "Protocolo", "Contenido"], [
    ["Cámaras IP", "MDVR", "RTSP / ONVIF", "Video 1080p, 4 canales"],
    ["MDVR", "Gateway IA", "RTSP o bus local", "Video para inferencia"],
    ["Gateway IA", "Central", "MQTT sobre TLS", "Conteos, eventos, salud del equipo"],
    ["Gateway telemático", "Gateway IA", "CAN / serial", "Velocidad, RPM, combustible, DTC"],
    ["Gateway IA", "Almacenamiento S3", "HTTPS", "Clips de 20–40 s de eventos"],
    ["Central", "Operador", "WebRTC / HLS", "Video en vivo bajo demanda"],
], [Cm(3.6), Cm(3.4), Cm(3.4), Cm(6.0)])

h2(doc, "3.2 Modos de operación")
bullets(doc, [
    "Normal: grabación continua, inferencia en tiempo real, eventos cada 5–10 s si hay novedad.",
    "Sin cobertura: grabación e inferencia locales; cola de eventos en disco con reintento exponencial.",
    "Sin energía: UPS mantiene 30–60 s para cerrar archivos y apagar ordenadamente.",
    "Sin IA: el MDVR sigue grabando y el gateway telemático reporta GPS; la central lo marca como degradado.",
])

# ── 4 hardware
h1(doc, "4", "Selección de hardware y lista de materiales")
p(doc, "La lista siguiente es por bus y usa precios de referencia de Ecuador (2026), en dólares. "
       "Se priorizó hardware con protocolos abiertos (ONVIF, JT/T 808-1078, CAN) para no quedar atado "
       "a un proveedor y poder integrar el software propio.")
table(doc, ["#", "Componente", "Modelo recomendado", "Cant.", "P. unit.", "P. total"], [
    ["1", "Cámara IP domo 2 MP IR 30 m IP67", "Hikvision DS-2CD2143G2-I o Dahua IPC-HDBW2231E-S", "4", "$150", "$600"],
    ["2", "Grabador MDVR 4 canales 1080p", "Streamax M1H / Howen Hero-ME40 / Jimi JC450", "1", "$650", "$650"],
    ["3", "Gateway de IA", "NVIDIA Jetson Orin Nano Super 8 GB", "1", "$249", "$249"],
    ["4", "Gateway telemático CAN/GPS", "Teltonika FMC650", "1", "$210", "$210"],
    ["5", "Router 4G LTE doble SIM", "Teltonika RUT241", "1", "$190", "$190"],
    ["6", "UPS / DC-DC 12 V 5 A", "Módulo automotriz con protección de descarga", "1", "$85", "$85"],
    ["7", "SSD industrial 1 TB", "Samsung PM883 / Kingston DC500M", "1", "$120", "$120"],
    ["8", "Gabinete antivandálico IP65", "Metálico con ventilación y cerradura", "1", "$90", "$90"],
    ["9", "Arnés, cableado, fusibles y conectores", "Automotriz 14 AWG, M12, portafusible", "1", "$140", "$140"],
    ["10", "Antenas LTE y GNSS externas", "Mimo 4G + GNSS activa, 3 m", "1", "$70", "$70"],
    ["11", "Instalación y calibración", "2 técnicos · 1 jornada", "1", "$260", "$260"],
    ["", "Subtotal por bus", "", "", "", "$2.664"],
    ["", "Contingencia 10 %", "", "", "", "$266"],
    ["", "Total por bus", "", "", "", "$2.930"],
    ["", "Total 10 buses", "", "", "", "$29.300"],
], [Cm(0.8), Cm(3.7), Cm(5.3), Cm(1.1), Cm(1.8), Cm(2.0)], size=8.2, bold_last=True)

h2(doc, "4.1 Por qué estos equipos")
bullets(doc, [
    "Cámaras: 2 MP es suficiente para conteo y evidencia; 4 MP multiplica almacenamiento sin mejorar la inferencia. IR real de 30 m y WDR para contra luz de ventanas.",
    "MDVR: debe grabar 4 canales a 1080p con SSD y exponer RTSP; JT/T 808-1078 facilita el reemplazo de proveedor.",
    "Jetson Orin Nano Super: 67 TOPS en 25 W, corre YOLO/RT-DETR y tracking en 4 canales sin GPU dedicada; ecosistema maduro y disponibilidad en Ecuador vía importadores.",
    "FMC650: lectura CAN, GPS multiconstelación, entradas digitales para puerta e ignición, y reporte por MQTT.",
    "RUT241: doble SIM, VPN, watchdog y rango de temperatura industrial; más barato que un router 5G que hoy no aporta en Quito.",
])

callout(doc, "Alternativa económica:", "si el piloto debe bajar de USD 1.800 por bus, usar 2 cámaras (puerta y salón), "
        "un MDVR con IA integrada y eliminar el Jetson. Se pierde la detección de somnolencia y la flexibilidad de modelos.")

# ── 5 alimentación
h1(doc, "5", "Alimentación, cableado y red")
h2(doc, "5.1 Consumo estimado")
table(doc, ["Equipo", "Consumo", "Horas/día", "Wh/día"], [
    ["4 cámaras IP", "4 W c/u · 16 W", "16", "256"],
    ["MDVR + SSD", "10 W", "16", "160"],
    ["Jetson Orin Nano", "15 W promedio", "16", "240"],
    ["Router 4G", "5 W", "16", "80"],
    ["Gateway telemático", "2 W", "16", "32"],
    ["Total", "48 W", "16", "768 Wh/día"],
], [Cm(5.0), Cm(4.4), Cm(3.0), Cm(3.5)])
p(doc, "Con 12 V, la corriente pico ronda 5 A. Se recomienda fusible de 7,5 A, cable de 14 AWG para "
       "alimentación y 18 AWG para señal, y masa directa al chasis con resistencia menor a 0,1 Ω.")

h2(doc, "5.2 Conexiones obligatorias")
table(doc, ["Señal", "Origen", "Destino", "Nota"], [
    ["+12 V permanente", "Batería (con fusible 7,5 A)", "UPS / DC-DC", "Protegido, no tomar de accesorios"],
    ["Ignición (ACC)", "Caja de fusibles", "Gateway telemático", "Permite saber si el bus está encendido"],
    ["Masa", "Chasis", "Todos los equipos", "Punto único, limpio de pintura"],
    ["CAN", "Puerto diagnóstico", "FMC650", "Trenzado, 120 Ω si aplica"],
    ["Video", "Cámaras", "MDVR", "PoE solo si el MDVR lo soporta; si no, 12 V local"],
    ["Datos", "MDVR y Jetson", "Router", "Switch interno o VLAN dedicada"],
], [Cm(3.2), Cm(4.2), Cm(3.4), Cm(5.6)])

callout(doc, "Regla de seguridad:", "nunca perforar el tanque de combustible, arneses principales ni largueros "
        "estructurales. Todo cable nuevo debe ir por canaleta existente o corrugado ignífugo, con holgura "
        "para vibración y sujeto cada 30 cm.")

h2(doc, "5.3 Red a bordo")
p(doc, "Se recomienda una red interna 192.168.10.0/24 con IP fija para cámaras, MDVR y Jetson. El router "
       "expone una VPN WireGuard hacia la central; el gateway telemático publica MQTT sobre TLS. Las "
       "actualizaciones se hacen por OTA con ventana nocturna y rollback automático si el equipo no "
       "reporta salud en 30 minutos.")

# ── 6 cámaras
h1(doc, "6", "Ubicación y montaje de las cámaras")
doc.add_picture(MOUNT, width=Cm(16.6))
doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
caption(doc, "Figura 2. Vista superior: posición de las cuatro cámaras y campo de visión esperado.")

table(doc, ["Cámara", "Posición", "Altura", "Lente", "Función"], [
    ["1 Frontal", "Detrás del espejo retrovisor", "1,95–2,10 m", "6 mm", "Contexto de vía, frenadas, incidentes"],
    ["2 Conductor", "Pilar A del conductor", "1,55–1,65 m", "4 mm", "Somnolencia, celular, cinturón"],
    ["3 Puerta", "Sobre el marco de la puerta delantera", "2,05–2,15 m", "2,8 mm", "Conteo de subida y evasión"],
    ["4 Salón", "Techo, parte delantera, mirando atrás", "2,15–2,25 m", "2,8 mm", "Ocupación, seguridad, caídas"],
], [Cm(2.6), Cm(5.6), Cm(3.2), Cm(1.8), Cm(5.4)])

h2(doc, "6.1 Criterios de montaje")
bullets(doc, [
    "La cámara de puerta debe ver el flujo completo de personas, no solo las cabezas: inclinar 30–40°.",
    "La cámara del conductor no debe reflejar el tablero ni el parabrisas; usar visera y ajustar exposición.",
    "La cámara de salón debe cubrir el pasillo y ambas filas de asientos; evitar que el pasa manos tape el centro.",
    "Fijar con tornillos autorroscantes y base antivibración; sellar con silicona neutra si atraviesa el techo.",
    "Etiquetar cada cable en ambos extremos (CAM1…CAM4) y dejar 20 cm de servicio.",
    "Probar el campo de visión con el bus en patio, a plena luz y de noche, antes de cerrar paneles.",
])

# ── 7 software
doc.add_page_break()
h1(doc, "7", "Configuración del software a bordo")
p(doc, "El gateway de IA ejecuta un sistema Linux mínimo con contenedores: un servicio de captura, uno de "
       "inferencia y uno de agentes (salud, cola de eventos, OTA). El MDVR es independiente y sigue grabando "
       "aunque el gateway se reinicie.")
table(doc, ["Parámetro", "Valor recomendado", "Motivo"], [
    ["Resolución", "1920 × 1080", "Equilibrio entre evidencia y cómputo"],
    ["FPS", "15 (frontal y puerta), 10 (salón y conductor)", "Suficiente para conteo y fatiga"],
    ["Bitrate", "2–3 Mbps por canal", "Calidad de evidencia sin saturar SSD"],
    ["Códec", "H.264 (H.265 si el MDVR lo soporta)", "Compatibilidad con visores"],
    ["GOP", "1–2 s", "Cortes precisos de clips"],
    ["Retención continua", "15 días", "Cubre reclamos y auditorías"],
    ["Retención de clips", "60 días", "Evidencia de incidentes"],
    ["Sincronización de hora", "NTP + RTC del MDVR", "Sin hora confiable no hay evidencia"],
    ["Umbral de somnolencia", "Ojos cerrados > 2,5 s", "Reduce falsos positivos"],
    ["Umbral de conteo", "Confianza > 0,55 + tracking", "Evita dobles conteos"],
], [Cm(4.2), Cm(5.6), Cm(6.4)])

# ── 8 procedimiento
h1(doc, "8", "Procedimiento de instalación paso a paso")
table(doc, ["#", "Paso", "Verificación"], [
    ["1", "Bloquear el bus, desconectar batería y esperar 5 minutos.", "Sin tensión en bornes"],
    ["2", "Inspeccionar el tablero y definir ruta de cableado con el supervisor.", "Ruta aprobada y sin perforaciones"],
    ["3", "Montar el gabinete en zona seca, accesible y ventilada.", "Fijación a chasis o estructura metálica"],
    ["4", "Tender el arnés por canaleta existente, sujeto cada 30 cm.", "Sin cables sueltos ni roces"],
    ["5", "Instalar portafusible de 7,5 A y alimentación permanente.", "12,2–14,4 V en el equipo"],
    ["6", "Conectar ignición (ACC) y masa a chasis.", "Continuidad < 0,1 Ω"],
    ["7", "Montar cámaras según plantilla y ajustar campo de visión.", "Cobertura validada en pantalla"],
    ["8", "Conectar video y alimentación al MDVR.", "4 canales visibles"],
    ["9", "Instalar Jetson, SSD y router; conectar a la red interna.", "IP fija responde a ping"],
    ["10", "Instalar antenas LTE y GNSS en el techo, separadas 20 cm.", "Señal > −95 dBm"],
    ["11", "Configurar NTP, zona horaria y nombres de canal.", "Hora correcta en los 4 videos"],
    ["12", "Grabar 30 minutos de prueba en condiciones reales.", "Clip reproducible y con audio solo donde aplique"],
    ["13", "Calibrar conteo con aforo manual de 10 minutos.", "Error ≤ 5 %"],
    ["14", "Probar subida de clip y alerta de pánico.", "Evento visible en la central < 10 s"],
    ["15", "Etiquetar cables, actualizar inventario y tomar fotos.", "Expediente del bus completo"],
    ["16", "Limpiar área, reponer paneles y entregar al supervisor.", "Acta firmada"],
], [Cm(0.9), Cm(9.9), Cm(5.4)])

callout(doc, "Tiempo estimado:", "6 horas por bus con dos técnicos. Si el bus no tiene preinstalación de canaletas, "
        "agregar 2 horas. Programar máximo 3 buses por jornada para control de calidad.")

# ── 9 pruebas
h1(doc, "9", "Pruebas de aceptación")
p(doc, "Cada bus se entrega solo si todas las pruebas marcan APROBADO. El acta del Anexo B se firma con "
       "los resultados y se adjunta al expediente del vehículo.")
table(doc, ["ID", "Prueba", "Criterio de aceptación"], [
    ["AT-01", "Video de las 4 cámaras", "Imagen nítida, sin franjas, con hora y nombre de canal"],
    ["AT-02", "Grabación continua", "30 min sin cortes; reproducción en el MDVR y en la central"],
    ["AT-03", "Visión nocturna", "Reconocible una persona a 3 m en salón y puerta"],
    ["AT-04", "GPS", "Posición en mapa con error < 10 m"],
    ["AT-05", "Telemetría CAN", "Velocidad, RPM y odómetro coinciden con el tablero"],
    ["AT-06", "Conteo", "Error ≤ 5 % frente a aforo manual de 10 min en hora pico"],
    ["AT-07", "Alerta de pánico", "Llega a la central en < 10 s con clip"],
    ["AT-08", "Somnolencia", "Detecta simulación de ojos cerrados en < 3 s"],
    ["AT-09", "Pérdida de señal", "El bus sigue grabando y sincroniza al recuperar"],
    ["AT-10", "Corte de energía", "UPS sostiene 30 s y apaga ordenadamente"],
    ["AT-11", "Consumo de datos", "≤ 150 MB en 24 h de operación normal"],
    ["AT-12", "Reinicio remoto", "El equipo vuelve a operar en < 3 min"],
], [Cm(1.6), Cm(5.4), Cm(9.2)])

# ── 10 operación
h1(doc, "10", "Operación y mantenimiento")
table(doc, ["Tarea", "Frecuencia", "Responsable"], [
    ["Limpieza de lentes y verificación visual", "Cada 15 días", "Jefe de patio"],
    ["Revisión de salud del SSD y espacio libre", "Mensual", "Taller / TI"],
    ["Descarga de evidencia solicitada", "Bajo demanda", "Supervisor"],
    ["Actualización de firmware (OTA)", "Trimestral", "TI"],
    ["Verificación de antenas y cableado", "Semestral", "Taller"],
    ["Prueba de UPS y batería", "Semestral", "Taller"],
    ["Auditoría de accesos y retención", "Anual", "Seguridad de la información"],
], [Cm(7.0), Cm(3.6), Cm(5.4)])
p(doc, "Repuestos críticos en stock: 1 cámara, 1 SSD, 1 router y 1 fuente UPS por cada 20 buses. "
       "Un bus con cámara caída no debe salir a ruta sin registrar la novedad en el sistema.")

# ── 11 costos
h1(doc, "11", "Costos del piloto")
table(doc, ["Concepto", "Cantidad", "Valor"], [
    ["Hardware e instalación por bus", "10", "$29.300"],
    ["Conectividad (3 meses, 10 SIM)", "30 SIM-mes", "$660"],
    ["Nube / almacenamiento (3 meses)", "3", "$360"],
    ["Capacitación a operadores y taller", "2 talleres", "$800"],
    ["Revisión legal y evaluación de impacto (DPIA)", "1", "$1.200"],
    ["Contingencia de proyecto (8 %)", "—", "$2.700"],
    ["Total piloto (3 meses)", "", "$35.020"],
], [Cm(8.4), Cm(3.6), Cm(4.2)], bold_last=True)
p(doc, "El costo por bus baja a medida que se compra por volumen: a partir de 50 buses se estima "
       "una reducción de 12–18 % en hardware y de 30 % en instalación.", 9.5, color=GRAY_C, italic=True)

# ── 12 seguridad
h1(doc, "12", "Seguridad, normativa y privacidad")
h2(doc, "12.1 Seguridad eléctrica y del vehículo")
bullets(doc, [
    "Todo circuito nuevo lleva fusible propio y protección contra inversión de polaridad.",
    "No se interviene el sistema de frenos, airbags ni dirección.",
    "El cableado no puede bloquear el pedal, la puerta ni el pasillo de evacuación.",
    "Los equipos deben operar entre −10 °C y 60 °C, con vibración según ISO 16750.",
])
h2(doc, "12.2 Privacidad (Ecuador)")
bullets(doc, [
    "Aviso visible en el bus: «Vehículo videovigilado» y finalidad del tratamiento.",
    "Ley Orgánica de Protección de Datos Personales: finalidad, minimización, proporcionalidad y seguridad.",
    "Sin reconocimiento facial de pasajeros y sin audio en el salón.",
    "Retención: video continuo 15 días; clips de eventos 60 días; metadatos agregados sin datos personales.",
    "Acceso por roles y registro de auditoría de quién consultó cada video.",
    "El monitoreo al conductor se informa por escrito y no puede derivar en sanción automática sin revisión humana.",
    "Evaluación de impacto (DPIA) y coordinación con la autoridad de protección de datos antes del piloto.",
])

# ── 13 riesgos
h1(doc, "13", "Riesgos y mitigaciones")
table(doc, ["Riesgo", "Impacto", "Mitigación"], [
    ["Robo o vandalismo del equipo", "Alto", "Gabinete oculto, tornillos de seguridad, seguro, cámara de evidencia"],
    ["Cobertura 4G irregular", "Medio", "Doble SIM, buffer local, store-and-forward"],
    ["Falsos positivos de IA", "Medio", "Umbrales conservadores y revisión humana antes de sancionar"],
    ["Sobrecalentamiento en cabina", "Medio", "Ubicación ventilada, disipador, prueba en hora pico"],
    ["Resistencia de conductores", "Alto", "Comunicación, enfoque en seguridad, incentivos, no vigilancia punitiva"],
    ["Obsolescencia del hardware", "Bajo", "Protocolos abiertos y arquitectura modular"],
    ["Incidente de privacidad", "Alto", "DPIA, avisos, retención corta, control de acceso y auditoría"],
], [Cm(4.6), Cm(2.4), Cm(9.2)])

# ── anexos
h1(doc, "", "Anexo A — Parámetros de configuración")
table(doc, ["Clave", "Valor"], [
    ["BUS_ID", "Identificador único del bus (ej. BUS-012)"],
    ["MQTT_URL", "mqtts://central.flota.local:8883"],
    ["MQTT_TOPIC", "flota/{BUS_ID}/telemetry · flota/{BUS_ID}/events"],
    ["NTP_SERVER", "ntp.epn.edu.ec / pool.ntp.org"],
    ["VIDEO_RETENTION_DAYS", "15"],
    ["CLIP_RETENTION_DAYS", "60"],
    ["COUNT_CONFIDENCE", "0,55"],
    ["DROWSY_SECONDS", "2,5"],
    ["UPLOAD_MAX_MBPS", "8"],
    ["TIMEZONE", "America/Guayaquil"],
], [Cm(5.2), Cm(11.2)])

doc.add_page_break()
h1(doc, "", "Anexo B — Acta de entrega del bus")
p(doc, "Bus: ____________________   Placa: ____________   Fecha: ____________", 10)
p(doc, "Técnico instalador: ____________________________   Supervisor: ____________________________", 10)
table(doc, ["Prueba", "Resultado", "Observación"], [
    ["AT-01 Video 4 cámaras", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-02 Grabación continua", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-03 Visión nocturna", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-04 GPS", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-05 Telemetría CAN", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-06 Conteo", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-07 Pánico", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-08 Somnolencia", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-09 Pérdida de señal", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-10 Corte de energía", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-11 Consumo de datos", "☐ Aprobado  ☐ Rechazado", ""],
    ["AT-12 Reinicio remoto", "☐ Aprobado  ☐ Rechazado", ""],
], [Cm(6.0), Cm(5.0), Cm(5.4)])
p(doc, "\nFirma instalador: ______________________        Firma supervisor: ______________________", 10)

p(doc, "Documento preparado para el piloto de 10 buses en Quito. Los modelos y precios son referenciales "
       "y deben validarse con cotizaciones locales antes de la compra.", 9, italic=True, color=GRAY_C)

out = os.path.join(BASE, "Manual-Instalacion-a-Bordo.docx")
doc.save(out)
print("OK:", out)
