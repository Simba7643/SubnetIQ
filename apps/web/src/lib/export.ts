import type { CalculationResult } from '@subnetiq/shared';

export function downloadFile(name: string, content: BlobPart, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function resultText(result: CalculationResult) {
  return [
    result.title,
    ...result.summary.map((field) => `${field.label}: ${String(field.value ?? '—')}`),
    '',
    ...result.warnings.map((warning) => `Note: ${warning}`),
    '',
    ...result.steps.map(
      (step, index) =>
        `${index + 1}. ${step.title}\n${step.description}${step.formula ? `\n${step.formula}` : ''}`,
    ),
    '',
    `Engine ${result.engineVersion}`,
  ].join('\n');
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\p{Cc}]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function resultCsv(result: CalculationResult) {
  const records: unknown[][] = [
    ['Result', result.title],
    ['Field', 'Value', 'Description'],
    ...result.summary.map((field) => [field.label, field.value, field.description ?? '']),
  ];
  if (result.rows?.length && result.columns?.length) {
    records.push(
      [],
      result.columns.map((column) => column.label),
      ...result.rows.map((row) => result.columns!.map((column) => row[column.key])),
    );
  }
  if (result.warnings.length)
    records.push([], ['Notes and limitations'], ...result.warnings.map((warning) => [warning]));
  if (result.steps.length)
    records.push(
      [],
      ['Step', 'Description', 'Formula'],
      ...result.steps.map((step) => [step.title, step.description, step.formula ?? '']),
    );
  records.push(
    [],
    ['Engine version', result.engineVersion],
    ...(result.sources ?? []).map((source) => ['Source', source]),
  );
  return records.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export async function exportResultPdf(result: CalculationResult) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const pdf = new jsPDF();
  const { preparePdfFont } = await import('./pdf-font');
  await preparePdfFont(pdf);
  pdf.setFontSize(20);
  pdf.text('SubnetIQ', 14, 20);
  pdf.setFontSize(13);
  pdf.text(result.title, 14, 30);
  autoTable(pdf, {
    startY: 38,
    head: [['Field', 'Value']],
    body: result.summary.map((field) => [field.label, String(field.value ?? '—')]),
    styles: { font: 'DejaVuSans', fontSize: 9, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 79, 83] },
  });
  if (result.rows?.length && result.columns?.length) {
    pdf.addPage();
    autoTable(pdf, {
      head: [result.columns.map((column) => column.label)],
      body: result.rows.map((row) =>
        result.columns!.map((column) => String(row[column.key] ?? '')),
      ),
      styles: { font: 'DejaVuSans', fontSize: 8, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 79, 83] },
    });
  }
  pdf.addPage();
  autoTable(pdf, {
    head: [['Explanation', 'Details']],
    body: [
      ...result.steps.map((step) => [
        step.title,
        `${step.description}${step.formula ? `\n${step.formula}` : ''}`,
      ]),
      ...result.warnings.map((warning) => ['Note', warning]),
      ['Engine version', result.engineVersion],
      ...(result.sources ?? []).map((source) => ['Source', source]),
    ],
    styles: { font: 'DejaVuSans', fontSize: 9, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 79, 83] },
  });
  pdf.save(`subnetiq-${result.toolId}.pdf`);
}
