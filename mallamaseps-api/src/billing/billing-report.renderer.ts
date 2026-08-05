import PDFDocument from 'pdfkit';

export interface BillingReportCategory {
  code: string;
  documents: number;
  pages: number;
  amount: number;
}

export interface BillingReportDailyPoint {
  date: string; // YYYY-MM-DD
  pages: number;
  amount: number;
}

export interface BillingExpenseReport {
  liquidationId: number;
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string;   // YYYY-MM-DD
  totalDocuments: number;
  totalPages: number;
  totalAmount: number;
  rateLabel: string;
  sourceFile: string;
  generatedAt: Date;
  categories: BillingReportCategory[];
  daily: BillingReportDailyPoint[];
}

// Paleta validada (superficie blanca): una sola tinta para las barras porque las
// categorías son nominales y la longitud ya codifica la magnitud.
const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const SERIES = '#2a78d6';
const GRIDLINE = '#e1e0d9';
const AXIS = '#c3c2b7';
const SURFACE = '#ffffff';

const MARGIN = 56;
const MAX_CATEGORY_BARS = 10;

export function formatInt(value: number): string {
  const rounded = Math.round(Math.abs(Number(value) || 0));
  const sign = Number(value) < 0 ? '-' : '';
  return sign + String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatMoney(value: number): string {
  return `$ ${formatInt(value)}`;
}

/** Fecha/hora en America/Bogota (UTC-5) sin depender de ICU. */
export function formatBogotaTimestamp(date: Date): string {
  const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}

function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(Math.max(rawStep, 1e-6)));
  const base = Math.pow(10, exponent);
  const normalized = rawStep / base;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * base;
}

/**
 * Escala del eje Y con marcas en números redondos: prueba 4, 5 y 6 divisiones y se
 * queda con la que menos aire deja sobre el máximo.
 */
function niceScale(maxValue: number): { max: number; ticks: number; step: number } {
  const target = Math.max(maxValue, 1);
  let best: { max: number; ticks: number; step: number } | null = null;

  for (const ticks of [4, 5, 6]) {
    const step = niceStep(target / ticks);
    const max = step * ticks;
    if (!best || max < best.max) best = { max, ticks, step };
  }

  return best as { max: number; ticks: number; step: number };
}

/** Barra horizontal: extremo de dato redondeado (4px), escuadra sobre la línea base. */
function barPath(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number): void {
  const radius = Math.min(4, width, height / 2);
  doc
    .moveTo(x, y)
    .lineTo(x + width - radius, y)
    .quadraticCurveTo(x + width, y, x + width, y + radius)
    .lineTo(x + width, y + height - radius)
    .quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    .lineTo(x, y + height)
    .closePath();
}

export function renderBillingExpenseReportPdf(report: BillingExpenseReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: 30, left: MARGIN, right: MARGIN },
    info: {
      Title: `Reporte de gastos de facturación #${report.liquidationId}`,
      Author: 'Mallamaseps',
      Subject: `Lote de facturación ${report.liquidationId}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawReport(doc, report);
  doc.end();

  return finished;
}

function drawReport(doc: PDFKit.PDFDocument, report: BillingExpenseReport): void {
  const contentWidth = doc.page.width - MARGIN * 2;
  let y = MARGIN;

  doc.fillColor(INK_PRIMARY).font('Helvetica-Bold').fontSize(24);
  doc.text('Reporte de gastos de facturación', MARGIN, y, { lineBreak: false });
  y += 32;

  doc.fillColor(INK_MUTED).font('Helvetica').fontSize(9.5);
  doc.text(
    `Lote de facturación #${report.liquidationId}  ·  Datos: ${report.rangeStart} a ${report.rangeEnd}`,
    MARGIN,
    y,
    { lineBreak: false },
  );
  y += 30;

  y = drawStats(doc, report, y, contentWidth);
  y += 30;

  y = drawSectionTitle(doc, 'Distribución de gasto por categoría', y);
  y = drawCategoryChart(doc, report, y, contentWidth);
  y += 30;

  y = drawSectionTitle(doc, 'Tendencia diaria de gasto', y);
  drawDailyChart(doc, report, y, contentWidth);

  drawFooter(doc, report, contentWidth);
}

function drawStats(
  doc: PDFKit.PDFDocument,
  report: BillingExpenseReport,
  y: number,
  contentWidth: number,
): number {
  const stats: [string, string][] = [
    ['Documentos: ', formatInt(report.totalDocuments)],
    ['Páginas: ', formatInt(report.totalPages)],
    ['Gasto total: ', formatMoney(report.totalAmount)],
  ];

  const columnWidth = contentWidth / stats.length;
  stats.forEach(([label, value], index) => {
    const x = MARGIN + columnWidth * index;
    doc.font('Helvetica').fontSize(11).fillColor(INK_SECONDARY);
    doc.text(label, x, y, { lineBreak: false, continued: true });
    doc.font('Helvetica-Bold').fillColor(INK_PRIMARY).text(value, { lineBreak: false });
  });

  return y + 16;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.font('Helvetica').fontSize(12).fillColor(INK_SECONDARY);
  doc.text(title, MARGIN, y, { lineBreak: false });
  return y + 26;
}

function drawCategoryChart(
  doc: PDFKit.PDFDocument,
  report: BillingExpenseReport,
  top: number,
  contentWidth: number,
): number {
  const rows = report.categories.slice(0, MAX_CATEGORY_BARS + 1);
  if (!rows.length) {
    doc.font('Helvetica').fontSize(9.5).fillColor(INK_MUTED);
    doc.text('Sin datos de categoría para este lote.', MARGIN, top, { lineBreak: false });
    return top + 16;
  }

  const labelWidth = 52;
  const barHeight = 14;
  const rowPitch = barHeight + 8; // el hueco de superficie separa barras vecinas
  const trackX = MARGIN + labelWidth + 10;
  const trackWidth = contentWidth - labelWidth - 10;
  const maxAmount = Math.max(...rows.map((r) => r.amount), 1);

  rows.forEach((row, index) => {
    const y = top + rowPitch * index;
    const width = Math.max(2, (row.amount / maxAmount) * trackWidth);

    doc.font('Helvetica').fontSize(9).fillColor(INK_MUTED);
    doc.text(row.code, MARGIN, y + 3.5, { width: labelWidth, align: 'right', lineBreak: false });

    barPath(doc, trackX, y, width, barHeight);
    doc.fillColor(SERIES).fill();

    const value = formatMoney(row.amount);
    doc.font('Helvetica').fontSize(8.5);
    const valueWidth = doc.widthOfString(value);

    // El valor sólo va dentro de la barra si cabe con aire a ambos lados.
    if (width + 6 + valueWidth <= trackWidth) {
      doc.fillColor(INK_SECONDARY);
      doc.text(value, trackX + width + 6, y + 4, { lineBreak: false });
    } else {
      doc.fillColor(SURFACE);
      doc.text(value, trackX + width - valueWidth - 8, y + 4, { lineBreak: false });
    }
  });

  return top + rowPitch * rows.length;
}

function drawDailyChart(
  doc: PDFKit.PDFDocument,
  report: BillingExpenseReport,
  top: number,
  contentWidth: number,
): number {
  const points = report.daily;
  if (!points.length) {
    doc.font('Helvetica').fontSize(9.5).fillColor(INK_MUTED);
    doc.text('Sin movimientos diarios para este lote.', MARGIN, top, { lineBreak: false });
    return top + 16;
  }

  const axisWidth = 48;
  const plotX = MARGIN + axisWidth;
  const plotWidth = contentWidth - axisWidth;
  const plotHeight = 170;
  const plotBottom = top + plotHeight;

  const scale = niceScale(Math.max(...points.map((p) => p.amount), 1));
  const maxAmount = scale.max;
  const inThousands = scale.max >= 10_000 && scale.step % 1000 === 0;

  doc.lineWidth(1);
  for (let i = 0; i <= scale.ticks; i++) {
    const value = scale.step * i;
    const y = plotBottom - (plotHeight / scale.ticks) * i;

    doc.moveTo(plotX, y).lineTo(plotX + plotWidth, y).strokeColor(i === 0 ? AXIS : GRIDLINE).stroke();

    doc.font('Helvetica').fontSize(8).fillColor(INK_MUTED);
    doc.text(inThousands ? `$${formatInt(value / 1000)}k` : `$${formatInt(value)}`, MARGIN, y - 4, {
      width: axisWidth - 8,
      align: 'right',
      lineBreak: false,
    });
  }

  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const pointX = (index: number) => (points.length > 1 ? plotX + stepX * index : plotX + plotWidth / 2);
  const pointY = (amount: number) => plotBottom - (Math.min(amount, maxAmount) / maxAmount) * plotHeight;

  doc.lineWidth(2).strokeColor(SERIES).lineJoin('round').lineCap('round');
  points.forEach((point, index) => {
    const x = pointX(index);
    const y = pointY(point.amount);
    if (index === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  });
  doc.stroke();

  // Un rótulo cada ~9 fechas: el eje carga los valores, no cada punto.
  const labelStep = Math.max(1, Math.ceil(points.length / 9));
  doc.font('Helvetica').fontSize(8).fillColor(INK_MUTED);
  for (let index = 0; index < points.length; index += labelStep) {
    const label = points[index].date.slice(5);
    doc.text(label, pointX(index) - 16, plotBottom + 8, { width: 32, align: 'center', lineBreak: false });
  }

  return plotBottom + 22;
}

function drawFooter(doc: PDFKit.PDFDocument, report: BillingExpenseReport, contentWidth: number): void {
  const y = doc.page.height - 52;

  doc.font('Helvetica').fontSize(7.5).fillColor(INK_MUTED);
  doc.text(`Fuente: ${report.sourceFile}  ·  Tarifa: ${report.rateLabel}`, MARGIN, y, { lineBreak: false });
  doc.text(`Generado ${formatBogotaTimestamp(report.generatedAt)}`, MARGIN, y, {
    width: contentWidth,
    align: 'right',
    lineBreak: false,
  });
}
