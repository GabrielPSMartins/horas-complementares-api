from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

PRIMARY = HexColor("#3300A0")
CARD_BG = HexColor("#F0F1FD")
ROW_ALT_BG = HexColor("#F6F8FD")
TEXT_DARK = HexColor("#1F2033")
TEXT_MUTED = HexColor("#6B7085")
TEXT_HOURS = HexColor("#0FA968")
WHITE = HexColor("#FFFFFF")

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 40
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

HEADER_HEIGHT = 130
CARD_HEIGHT = 74
CARD_GAP = 14
TABLE_HEADER_HEIGHT = 30
ROW_HEIGHT = 30

COLUMNS = [
    ("Tipo de Atividade", 0.29),
    ("Descrição", 0.42),
    ("Data", 0.16),
    ("Horas", 0.13),
]

MONTHS = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

REPORT_TIMEZONE = ZoneInfo("America/Sao_Paulo")


def _format_long_date(value: datetime) -> str:
    local = value.astimezone(REPORT_TIMEZONE)
    return f"{local.day:02d} de {MONTHS[local.month - 1]} de {local.year}"


def _format_short_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _truncate(text: str, font: str, size: float, max_width: float) -> str:
    if stringWidth(text, font, size) <= max_width:
        return text

    ellipsis = "..."
    while text and stringWidth(text + ellipsis, font, size) > max_width:
        text = text[:-1]

    return text.rstrip() + ellipsis


class ReportPdfService:

    def __init__(self, report: dict):
        self.report = report
        self.buffer = BytesIO()
        self.pdf = canvas.Canvas(self.buffer, pagesize=A4)
        self.column_x = self._compute_column_positions()

    def render(self) -> bytes:
        student = self.report["student"]
        self.pdf.setTitle(f"Relatório de Horas Complementares - {student['name']}")
        self.pdf.setAuthor("Sistema de Horas Complementares - FEPI")

        y = self._draw_header()
        y = self._draw_cards(y - 28)
        self._draw_activities(y - 36)

        self.pdf.save()
        return self.buffer.getvalue()

    def _compute_column_positions(self) -> list[float]:
        positions = []
        x = MARGIN
        for _, ratio in COLUMNS:
            positions.append(x)
            x += CONTENT_WIDTH * ratio
        return positions

    def _draw_header(self) -> float:
        student = self.report["student"]
        course = self.report["course"]
        top = PAGE_HEIGHT

        self.pdf.setFillColor(PRIMARY)
        self.pdf.rect(0, top - HEADER_HEIGHT, PAGE_WIDTH, HEADER_HEIGHT, stroke=0, fill=1)

        self.pdf.setFillColor(WHITE)
        self.pdf.setFont(FONT_BOLD, 21)
        self.pdf.drawString(MARGIN, top - 50, "Relatório de Horas Complementares")

        info = "  ·  ".join(
            [
                student["name"],
                f"Mat. {student['registration_number']}",
                course["name"],
                f"{student['current_semester']}º semestre",
            ]
        )
        self.pdf.setFont(FONT, 12)
        self.pdf.drawString(
            MARGIN,
            top - 80,
            _truncate(info, FONT, 12, CONTENT_WIDTH),
        )

        self.pdf.drawString(
            MARGIN,
            top - 104,
            f"Gerado em: {_format_long_date(self.report['generated_at'])}",
        )

        return top - HEADER_HEIGHT

    def _draw_cards(self, top: float) -> float:
        summary = self.report["summary"]
        cards = [
            (f"{summary['total_required_hours']}h", "Horas Exigidas"),
            (f"{summary['total_approved_hours']}h", "Horas Aprovadas"),
            (f"{summary['remaining_hours']}h", "Horas Restantes"),
            (f"{round(summary['progress_percentage'])}%", "Progresso"),
        ]

        card_width = (CONTENT_WIDTH - CARD_GAP * (len(cards) - 1)) / len(cards)
        bottom = top - CARD_HEIGHT

        for index, (value, label) in enumerate(cards):
            x = MARGIN + index * (card_width + CARD_GAP)
            center = x + card_width / 2

            self.pdf.setFillColor(CARD_BG)
            self.pdf.roundRect(x, bottom, card_width, CARD_HEIGHT, 10, stroke=0, fill=1)

            self.pdf.setFillColor(PRIMARY)
            self.pdf.setFont(FONT_BOLD, 19)
            self.pdf.drawCentredString(center, bottom + 38, value)

            self.pdf.setFillColor(TEXT_MUTED)
            self.pdf.setFont(FONT, 8.5)
            self.pdf.drawCentredString(center, bottom + 18, label)

        return bottom

    def _draw_table_header(self, top: float) -> float:
        bottom = top - TABLE_HEADER_HEIGHT

        self.pdf.setFillColor(PRIMARY)
        self.pdf.rect(MARGIN, bottom, CONTENT_WIDTH, TABLE_HEADER_HEIGHT, stroke=0, fill=1)

        self.pdf.setFillColor(WHITE)
        self.pdf.setFont(FONT_BOLD, 9.5)
        for (title, _), x in zip(COLUMNS, self.column_x):
            self.pdf.drawString(x + 10, bottom + 11, title)

        return bottom

    def _draw_activities(self, top: float) -> None:
        activities = self.report["approved_activities"]
        y = self._draw_table_header(top)

        if not activities:
            self.pdf.setFillColor(TEXT_MUTED)
            self.pdf.setFont(FONT, 10)
            self.pdf.drawString(MARGIN + 10, y - 20, "Nenhuma atividade aprovada até o momento.")
            return

        for index, activity in enumerate(activities):
            if y - ROW_HEIGHT < MARGIN:
                self.pdf.showPage()
                y = self._draw_table_header(PAGE_HEIGHT - MARGIN)

            bottom = y - ROW_HEIGHT

            if index % 2 == 0:
                self.pdf.setFillColor(ROW_ALT_BG)
                self.pdf.rect(MARGIN, bottom, CONTENT_WIDTH, ROW_HEIGHT, stroke=0, fill=1)

            self._draw_row(activity, bottom + 11)
            y = bottom

    def _draw_row(self, activity: dict, baseline: float) -> None:
        widths = [CONTENT_WIDTH * ratio - 20 for _, ratio in COLUMNS]
        description = activity.get("description") or activity["title"]

        self.pdf.setFillColor(TEXT_DARK)
        self.pdf.setFont(FONT_BOLD, 9.5)
        self.pdf.drawString(
            self.column_x[0] + 10,
            baseline,
            _truncate(activity["activity_type_name"], FONT_BOLD, 9.5, widths[0]),
        )

        self.pdf.setFillColor(TEXT_MUTED)
        self.pdf.setFont(FONT, 9.5)
        self.pdf.drawString(
            self.column_x[1] + 10,
            baseline,
            _truncate(description, FONT, 9.5, widths[1]),
        )
        self.pdf.drawString(
            self.column_x[2] + 10,
            baseline,
            _format_short_date(activity["activity_date"]),
        )

        self.pdf.setFillColor(TEXT_HOURS)
        self.pdf.setFont(FONT_BOLD, 9.5)
        self.pdf.drawString(
            self.column_x[3] + 10,
            baseline,
            f"{activity['accepted_hours'] or 0}h",
        )


def build_report_pdf(report: dict) -> bytes:
    return ReportPdfService(report).render()