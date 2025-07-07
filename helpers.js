const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");
const dotenv = require("dotenv");

const envPath = path.join(__dirname, ".env");

dotenv.config({ path: envPath });

const basePath = process.pkg ? path.dirname(process.execPath) : __dirname;

const SHIPPER = {
  name: process.env.SHIPPER_NAME,
  phone: process.env.SHIPPER_PHONE,
  origin: process.env.SHIPPER_ORIGIN,
  pickup: process.env.SHIPPER_PICKUP,
};

function getDate() {
  const date = new Date();

  const day = String(date.getDate()).padStart(2, "0");

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = monthNames[date.getMonth()];

  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

async function generatePDF(orders, folderPath, lastTracking) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 20;
  const slipHeight = (pageHeight - margin * 2) / 3;
  let date = getDate();

  const wrapText = (text, maxWidth, font, size) => {
    if (!text) return [];
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width < maxWidth) {
        line = testLine;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const logoPath = path.join(basePath, "logo.png");
  const logoImageBytes = fs.readFileSync(logoPath);
  const logoImage = await pdfDoc.embedPng(logoImageBytes);
  const logoWidth = 150;
  const logoHeight = 150;

  for (let i = 0; i < orders.length; i++) {
    const slipIndexOnPage = i % 3;
    if (slipIndexOnPage === 0) {
      var page = pdfDoc.addPage([pageWidth, pageHeight]);
    }

    lastTracking++;
    const order = orders[i];
    order.tracking = lastTracking;

    const slipTop = pageHeight - margin - slipIndexOnPage * slipHeight;
    const slipBottom = slipTop - slipHeight;
    let y = slipTop - 15;

    // Slip Border
    page.drawRectangle({
      x: margin,
      y: slipBottom,
      width: pageWidth - margin * 2,
      height: slipHeight,
      borderWidth: 1,
      borderColor: rgb(0.6, 0.6, 0.6),
    });

    // --- QR Code (Top Right) ---
    const qrDataUrl = await QRCode.toDataURL("www.medluck.pk");
    const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    const qrSize = 70;

    page.drawImage(logoImage, {
      x: pageWidth - margin - qrSize - 70,
      y: slipTop - logoHeight + 50,
      width: logoWidth,
      height: logoHeight,
    });

    const drawText = (label, value, x, y, size = 9, xGap = 75) => {
      page.drawText(`${label}:`, { x, y, size, font: bold });
      page.drawText(value, { x: x + xGap, y, size, font });
      return y - 13;
    };

    const drawMultiline = (
      label,
      value,
      x,
      y,
      size = 8,
      labelWidth = 75,
      maxWidthOverride
    ) => {
      const defaultMaxWidth = pageWidth - margin * 2 - x - labelWidth;
      const maxWidth = maxWidthOverride ?? defaultMaxWidth;
      const lines = wrapText(value, maxWidth, font, size);

      page.drawText(`${label}:`, { x, y, size: size + 1, font: bold });
      lines.forEach((line, idx) => {
        page.drawText(line, {
          x: x + labelWidth,
          y: y - idx * 11,
          size,
          font,
        });
      });
      return y - lines.length * 11 - 6;
    };

    y -= 5;

    // --- Consignee Info ---
    page.drawText("Consignee Info", {
      x: margin + 10,
      y,
      font: bold,
      size: 10,
    });
    y -= 20;
    // Name + Contact in same line
    page.drawText(`Name:`, { x: margin + 10, y, size: 9, font: bold });
    page.drawText(order.name, { x: margin + 65, y, size: 9, font });
    page.drawText(`Contact:`, { x: margin + 250, y, size: 9, font: bold });
    page.drawText(order.phone, { x: margin + 310, y, size: 9, font });
    y -= 20;
    y = drawMultiline("Address", order.address, margin + 10, y, 8, 55, 350);
    y = drawText("City", order.city, margin + 10, y, 9, 55);
    // Divider
    y -= 5;
    page.drawRectangle({
      x: margin + 10,
      y,
      width: pageWidth - margin * 2 - 20,
      height: 0.7,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 20;

    // --- Shipment Info ---
    page.drawText("Shipment Info", { x: margin + 10, y, font: bold, size: 10 });
    y -= 17;

    page.drawImage(qrImage, {
      x: pageWidth - margin - qrSize - 10,
      y: y - qrSize + 10,
      width: qrSize,
      height: qrSize,
    });

    // Date + Tracking No + Order Ref (same line)
    page.drawText(`Date:`, { x: margin + 10, y, size: 9, font: bold });
    page.drawText(date, { x: margin + 50, y, size: 9, font });

    page.drawText(`Tracking:`, { x: margin + 150, y, size: 9, font: bold });
    page.drawText(order.tracking.toString(), {
      x: margin + 215,
      y,
      size: 9,
      font,
    });

    page.drawText(`Order:`, { x: margin + 300, y, size: 9, font: bold });
    page.drawText(order.order, { x: margin + 345, y, size: 9, font });
    y -= 15;

    // Items (multiline) + Amount (next line)
    y = drawText(
      "Amount",
      `Rs ${order.price.toLocaleString()}/-`,
      margin + 10,
      y
    );
    y -= 2;
    y = drawMultiline("Items", order.item, margin + 10, y);
    y = drawText("Remarks", order.notes, margin + 10, y);

    // Divider
    y -= 5;
    page.drawRectangle({
      x: margin + 10,
      y,
      width: pageWidth - margin * 2 - 20,
      height: 0.7,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 20;

    // --- Shipper Info ---
    page.drawText("Shipper Info", { x: margin + 10, y, font: bold, size: 10 });
    y -= 17;
    // Name + Contact in same line
    page.drawText(`Name:`, { x: margin + 10, y, size: 9, font: bold });
    page.drawText(SHIPPER.name ?? "", { x: margin + 60, y, size: 9, font });
    page.drawText(`Contact:`, { x: margin + 250, y, y, size: 9, font: bold });
    page.drawText(SHIPPER.phone ?? "", { x: margin + 310, y, size: 9, font });
    y -= 13;

    y = drawMultiline(
      "Pickup / Return Address",
      SHIPPER.pickup,
      margin + 10,
      y,
      8,
      110
    );

    // Bottom line
    page.drawRectangle({
      x: margin,
      y: slipBottom - 2,
      width: pageWidth - margin * 2,
      height: 1.5,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(folderPath, "order_slips.pdf");
  fs.writeFileSync(outputPath, pdfBytes);
  console.log("✅ PDF saved as 'order_slips.pdf'");
  return orders;
}

async function generateChecklistPDF(orders, folderPath) {
  const totalAmount = orders.reduce(
    (sum, order) => sum + Number(order.price),
    0
  );

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const marginY = 40;
  const contentMarginX = 20;
  const rowHeight = 18;
  const fontSize = 9;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginY;

  const rowStartX = contentMarginX;
  const rowWidth = pageWidth - 2 * contentMarginX;

  const xOffsets = {
    no: rowStartX,
    order: 50,
    tracking: 120,
    name: rowStartX + 170,
    amount: rowStartX + 270,
    address: rowStartX + 320,
  };

  const colWidths = {
    no: 50,
    order: 120,
    tracking: 70,
    name: 100,
    amount: 50,
    address: rowWidth - 330,
  };

  const wrapText = (text, maxWidth, font, fontSize) => {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width < maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const drawText = (text, x, y, options = {}) => {
    page.drawText(text, {
      x,
      y,
      font,
      size: fontSize,
      ...options,
    });
  };

  const drawHeader = () => {
    y -= rowHeight;
    drawText("Shipment Loadsheet", rowStartX, y, { font: bold, size: 14 });

    y -= rowHeight;
    drawText(`Shipper: ${SHIPPER.name}`, rowStartX + 80, y);
    drawText(`Date: ${getDate()}`, rowStartX + 180, y);
    drawText(`Total Shipments: ${orders.length}`, rowStartX + 280, y);
    drawText(
      `Total Amount: Rs ${totalAmount.toLocaleString()}/-`,
      rowStartX + 380,
      y
    );

    y -= rowHeight + 10;
    page.drawRectangle({
      x: rowStartX,
      y,
      width: rowWidth,
      height: rowHeight,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 0.5,
    });

    drawText("No.", xOffsets.no + 4, y + 4, { font: bold });
    drawText("Tracking", xOffsets.tracking + 4, y + 4, { font: bold });
    drawText("Order #", xOffsets.order + 4, y + 4, { font: bold });
    drawText("Customer Name", xOffsets.name + 4, y + 4, { font: bold });
    drawText("Amount", xOffsets.amount + 4, y + 4, { font: bold });
    drawText("Address", xOffsets.address + 4, y + 4, { font: bold });
    const lineX = [
      xOffsets.no,
      xOffsets.order,
      xOffsets.tracking,
      xOffsets.name,
      xOffsets.amount,
      xOffsets.address,
      rowStartX + rowWidth,
    ];

    lineX.forEach((x) => {
      page.drawLine({
        start: { x, y },
        end: { x, y: y + rowHeight },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
    });

    y -= rowHeight;
  };

  const drawRow = (order, addressLines, startY, index) => {
    const height = addressLines.length * rowHeight;

    page.drawRectangle({
      x: rowStartX,
      y: startY - height,
      width: rowWidth,
      height,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    const lineX = [
      xOffsets.no,
      xOffsets.order,
      xOffsets.tracking,
      xOffsets.name,
      xOffsets.amount,
      xOffsets.address,
      rowStartX + rowWidth,
    ];
    lineX.forEach((x) => {
      page.drawLine({
        start: { x, y: startY },
        end: { x, y: startY - height },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });
    });

    drawText(`${index + 1}`, xOffsets.no + 4, startY - rowHeight + 4);
    drawText(
      order.tracking.toString(),
      xOffsets.tracking + 4,
      startY - rowHeight + 4
    );
    drawText(order.order, xOffsets.order + 4, startY - rowHeight + 4);
    drawText(order.name, xOffsets.name + 4, startY - rowHeight + 4);
    drawText(
      `Rs ${order.price.toLocaleString()}/-`,
      xOffsets.amount + 4,
      startY - rowHeight + 4
    );

    for (let i = 0; i < addressLines.length; i++) {
      drawText(
        addressLines[i],
        xOffsets.address + 4,
        startY - rowHeight * (i + 1) + 4
      );
    }
  };

  drawHeader();

  for (const order of orders) {
    const addressLines = wrapText(
      order.address,
      colWidths.address - 8,
      font,
      fontSize
    );
    const requiredHeight = addressLines.length * rowHeight;

    // Ensure enough space on page
    if (y - requiredHeight < marginY + rowHeight * 2) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - marginY;
      // drawHeader();
    }

    drawRow(order, addressLines, y, orders.indexOf(order));
    y -= requiredHeight;
  }

  if (y - 2 * rowHeight >= marginY) {
    y -= 2 * rowHeight;
    drawText("Received By: _________________________", rowStartX, y, {
      font: bold,
      size: 11,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(folderPath, "loadsheet.pdf");
  fs.writeFileSync(outputPath, pdfBytes);
  console.log("✅ Checklist PDF saved as 'shipment_checklist.pdf'");
}

function getUniqueFolderPath(baseDir, baseName) {
  let folderPath = path.join(baseDir, baseName);
  let counter = 1;

  while (fs.existsSync(folderPath)) {
    folderPath = path.join(baseDir, `${baseName}-${counter}`);
    counter++;
  }

  return folderPath;
}

module.exports = {
  generatePDF,
  generateChecklistPDF,
  getUniqueFolderPath,
  getDate,
};
