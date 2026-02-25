import ExcelJS from 'exceljs';
export function createStandardSheet(title, columns) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'eSRS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Report');
    const headerLines = [
        'Republic of the Philippines',
        'Department of Environment and Natural Resources',
        'MINES AND GEOSCIENCES BUREAU',
        'Mineral Economics, Information & Publications Division',
        '',
        title,
        `Generated: ${new Date().toLocaleString()}`
    ];
    headerLines.forEach((line, idx) => {
        const row = sheet.getRow(idx + 1);
        row.getCell(1).value = line;
        row.getCell(1).font = { bold: idx < 4 || idx === 5 };
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    const totalCols = Math.max(columns.length, 1);
    const lastColLetter = sheet.getColumn(totalCols).letter;
    for (let r = 1; r <= headerLines.length; r++) {
        sheet.mergeCells(`A${r}:${lastColLetter}${r}`);
    }
    const headerRowIndex = headerLines.length + 2;
    const headerRow = sheet.getRow(headerRowIndex);
    columns.forEach((c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = c;
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });
    headerRow.height = 20;
    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];
    // Reasonable default widths
    columns.forEach((_c, i) => {
        sheet.getColumn(i + 1).width = Math.min(40, Math.max(12, columns[i].length + 2));
    });
    return { workbook, sheet, headerRowIndex };
}
export async function sendWorkbook(res, workbook, fileName) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
}
