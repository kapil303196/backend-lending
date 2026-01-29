/**
 * Professional PDF Report Generator for Call Analytics
 * Creates visually stunning, stakeholder-ready reports
 * FIXED: No extra empty pages
 */

const PDFDocument = require("pdfkit");

// Color palette
const colors = {
  primary: "#4F46E5",
  primaryDark: "#3730A3",
  secondary: "#7C3AED",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  text: "#1F2937",
  textLight: "#6B7280",
  textMuted: "#9CA3AF",
  background: "#F9FAFB",
  backgroundAlt: "#F3F4F6",
  border: "#E5E7EB",
  white: "#FFFFFF",
};

// Page dimensions (A4)
const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
  contentWidth: 515.28,
};

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatDurationLong(seconds) {
  if (!seconds || seconds < 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatNumber(num) {
  if (num === undefined || num === null) return "0";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Safe text drawing that won't create new pages
function safeText(doc, text, x, y, options = {}) {
  const opts = { ...options, lineBreak: false };
  doc.text(text, x, y, opts);
}

function drawRoundedRect(doc, x, y, width, height, radius, fillColor) {
  doc.roundedRect(x, y, width, height, radius).fill(fillColor);
}

function drawProgressBar(doc, x, y, width, height, percentage, fillColor, bgColor = colors.backgroundAlt) {
  doc.roundedRect(x, y, width, height, height / 2).fill(bgColor);
  const fillWidth = Math.max((width * Math.min(percentage, 100)) / 100, height);
  if (percentage > 0) {
    doc.roundedRect(x, y, fillWidth, height, height / 2).fill(fillColor);
  }
}

function drawHeader(doc, period) {
  // Header background
  doc.rect(0, 0, PAGE.width, 50).fill(colors.primary);
  doc.rect(0, 50, PAGE.width, 50).fill(colors.primaryDark);

  // Decorative circles
  doc.opacity(0.1);
  doc.circle(PAGE.width - 50, 30, 60).fill(colors.white);
  doc.circle(PAGE.width - 100, 80, 40).fill(colors.white);
  doc.circle(50, 70, 30).fill(colors.white);
  doc.opacity(1);

  // Title
  doc.fontSize(28).fillColor(colors.white);
  safeText(doc, "Call Analytics Report", 0, 30, { align: "center", width: PAGE.width });

  // Date
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  doc.fontSize(11).fillColor(colors.white).opacity(0.9);
  safeText(doc, dateStr, 0, 65, { align: "center", width: PAGE.width });
  doc.opacity(1);

  // Period
  if (period) {
    doc.fontSize(9).fillColor(colors.white).opacity(0.7);
    safeText(doc, `Report Period: ${period} days`, 0, 82, { align: "center", width: PAGE.width });
    doc.opacity(1);
  }

  return 120;
}

function drawSectionTitle(doc, title, y) {
  doc.rect(PAGE.margin, y, 4, 20).fill(colors.primary);
  doc.fontSize(14).fillColor(colors.text);
  safeText(doc, title, PAGE.margin + 12, y + 3);
  return y + 30;
}

function drawKPICard(doc, x, y, width, height, label, value, change, accentColor) {
  drawRoundedRect(doc, x, y, width, height, 6, colors.white);
  doc.rect(x, y + 8, 3, height - 16).fill(accentColor);

  doc.fontSize(9).fillColor(colors.textLight);
  safeText(doc, label, x + 14, y + 10);

  doc.fontSize(20).fillColor(colors.text);
  safeText(doc, String(value), x + 14, y + 26);

  if (change !== null && change !== undefined) {
    const isPositive = parseFloat(change) >= 0;
    doc.fontSize(9).fillColor(isPositive ? colors.success : colors.danger);
    safeText(doc, `${isPositive ? "+" : ""}${change}%`, x + width - 45, y + 12);
  }
}

function drawKPISection(doc, stats, startY) {
  const kpis = stats.kpis || {};
  let y = drawSectionTitle(doc, "Key Performance Indicators", startY);

  const cardWidth = (PAGE.contentWidth - 30) / 4;
  const cardHeight = 65;
  const gap = 10;

  // Row 1
  drawKPICard(doc, PAGE.margin, y, cardWidth, cardHeight, "Total Calls", formatNumber(kpis.totalCalls?.value || 0), kpis.totalCalls?.change, colors.primary);
  drawKPICard(doc, PAGE.margin + cardWidth + gap, y, cardWidth, cardHeight, "Answer Rate", `${kpis.answerRate?.value || 0}%`, null, colors.success);
  drawKPICard(doc, PAGE.margin + (cardWidth + gap) * 2, y, cardWidth, cardHeight, "Avg Duration", formatDuration(kpis.avgDuration?.value || 0), kpis.avgDuration?.change, colors.info);
  drawKPICard(doc, PAGE.margin + (cardWidth + gap) * 3, y, cardWidth, cardHeight, "Total Talk Time", formatDurationLong(kpis.totalDuration?.value || 0), null, colors.secondary);

  y += cardHeight + gap;

  // Row 2
  drawKPICard(doc, PAGE.margin, y, cardWidth, cardHeight, "Inbound Calls", formatNumber(kpis.inboundCalls || 0), null, colors.success);
  drawKPICard(doc, PAGE.margin + cardWidth + gap, y, cardWidth, cardHeight, "Outbound Calls", formatNumber(kpis.outboundCalls || 0), null, colors.info);
  drawKPICard(doc, PAGE.margin + (cardWidth + gap) * 2, y, cardWidth, cardHeight, "AI Transcribed", formatNumber(kpis.withTranscription || 0), null, colors.secondary);
  drawKPICard(doc, PAGE.margin + (cardWidth + gap) * 3, y, cardWidth, cardHeight, "With Recording", formatNumber(kpis.withRecording || 0), null, colors.warning);

  return y + cardHeight + 25;
}

function drawDirectionAndStatus(doc, stats, startY) {
  const directions = stats.direction || [];
  const statuses = stats.status || [];
  const halfWidth = (PAGE.contentWidth - 15) / 2;

  let y = drawSectionTitle(doc, "Call Direction", startY);

  // Direction card
  drawRoundedRect(doc, PAGE.margin, y, halfWidth, 80, 6, colors.white);

  const totalCalls = directions.reduce((sum, d) => sum + (d.count || 0), 0) || 1;
  let dirY = y + 12;

  directions.forEach((dir) => {
    const percentage = ((dir.count || 0) / totalCalls * 100);
    const barColor = dir.type === "inbound" ? colors.success : colors.info;
    const label = (dir.type || "Unknown").charAt(0).toUpperCase() + (dir.type || "unknown").slice(1);

    doc.fontSize(10).fillColor(colors.text);
    safeText(doc, label, PAGE.margin + 12, dirY);
    doc.fontSize(9).fillColor(colors.textLight);
    safeText(doc, `${dir.count || 0} calls (${dir.completionRate || 0}% answered)`, PAGE.margin + 12, dirY + 12);
    drawProgressBar(doc, PAGE.margin + 12, dirY + 26, halfWidth - 24, 8, percentage, barColor);
    dirY += 38;
  });

  // Status section
  doc.rect(PAGE.margin + halfWidth + 15, startY, 4, 20).fill(colors.primary);
  doc.fontSize(14).fillColor(colors.text);
  safeText(doc, "Call Status Distribution", PAGE.margin + halfWidth + 27, startY + 3);

  drawRoundedRect(doc, PAGE.margin + halfWidth + 15, y, halfWidth, 80, 6, colors.white);

  const statusColors = {
    completed: colors.success, "no-answer": colors.warning, "in-progress": colors.info,
    busy: colors.danger, failed: colors.danger, canceled: colors.textMuted, ringing: colors.info
  };

  let statusY = y + 12;
  statuses.slice(0, 3).forEach((status) => {
    const percentage = parseFloat(status.percentage || 0);
    const statusName = (status.status || "Unknown").charAt(0).toUpperCase() + (status.status || "unknown").slice(1);
    const barColor = statusColors[status.status] || colors.textLight;

    doc.fontSize(9).fillColor(colors.text);
    safeText(doc, statusName, PAGE.margin + halfWidth + 27, statusY);
    doc.fontSize(8).fillColor(colors.textLight);
    safeText(doc, `${status.count} (${percentage}%)`, PAGE.margin + PAGE.contentWidth - 60, statusY);
    drawProgressBar(doc, PAGE.margin + halfWidth + 27, statusY + 12, halfWidth - 24, 6, percentage, barColor);
    statusY += 24;
  });

  return y + 90;
}

function drawPeakHours(doc, stats, startY) {
  const peakHours = stats.peakHours || [];
  if (peakHours.length === 0) return startY;

  let y = drawSectionTitle(doc, "Peak Call Hours", startY);
  const numHours = Math.min(peakHours.length, 5);
  const cardHeight = numHours * 28 + 20;

  drawRoundedRect(doc, PAGE.margin, y, PAGE.contentWidth, cardHeight, 6, colors.white);

  const maxCalls = Math.max(...peakHours.map(p => p.calls || 0)) || 1;

  peakHours.slice(0, 5).forEach((peak, i) => {
    const rowY = y + 12 + i * 28;
    const percentage = (peak.calls / maxCalls) * 100;
    const badgeColor = i === 0 ? colors.warning : i === 1 ? colors.textMuted : i === 2 ? "#CD7F32" : colors.backgroundAlt;
    const txtColor = i < 3 ? colors.white : colors.text;

    drawRoundedRect(doc, PAGE.margin + 12, rowY, 24, 20, 4, badgeColor);
    doc.fontSize(10).fillColor(txtColor);
    safeText(doc, `${i + 1}`, PAGE.margin + 18, rowY + 4);

    doc.fontSize(10).fillColor(colors.text);
    safeText(doc, peak.hour, PAGE.margin + 48, rowY + 4);

    doc.fontSize(9).fillColor(colors.textLight);
    safeText(doc, `${peak.calls} calls`, PAGE.margin + 140, rowY + 5);

    drawProgressBar(doc, PAGE.margin + 210, rowY + 6, PAGE.contentWidth - 240, 10, percentage, colors.primary);
  });

  return y + cardHeight + 20;
}

function drawAIInsights(doc, insights, startY) {
  if (!insights?.insights?.length && !insights?.summary) return startY;

  let y = drawSectionTitle(doc, "AI-Generated Insights", startY);

  // Executive summary
  if (insights.summary) {
    drawRoundedRect(doc, PAGE.margin, y, PAGE.contentWidth, 70, 6, colors.primary);

    doc.opacity(0.1);
    doc.circle(PAGE.margin + PAGE.contentWidth - 30, y + 35, 40).fill(colors.white);
    doc.opacity(1);

    doc.fontSize(9).fillColor(colors.white).opacity(0.8);
    safeText(doc, "EXECUTIVE SUMMARY", PAGE.margin + 15, y + 10);
    doc.opacity(1);

    doc.fontSize(10).fillColor(colors.white);
    doc.text(insights.summary, PAGE.margin + 15, y + 26, {
      width: PAGE.contentWidth - 30,
      height: 38,
      ellipsis: true,
      lineGap: 2
    });

    y += 85;
  }

  // Insight cards (2x2 grid)
  if (insights.insights?.length > 0) {
    const cardWidth = (PAGE.contentWidth - 10) / 2;
    const cardHeight = 68;

    insights.insights.slice(0, 4).forEach((insight, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cardX = PAGE.margin + col * (cardWidth + 10);
      const cardY = y + row * (cardHeight + 10);

      const prioColors = { high: colors.danger, medium: colors.warning, low: colors.info };
      const accent = prioColors[insight.priority] || colors.textLight;

      drawRoundedRect(doc, cardX, cardY, cardWidth, cardHeight, 6, colors.white);
      doc.rect(cardX, cardY, 4, cardHeight).fill(accent);

      doc.fontSize(7).fillColor(accent);
      safeText(doc, (insight.priority || "info").toUpperCase(), cardX + 12, cardY + 8);

      doc.fontSize(10).fillColor(colors.text);
      doc.text(insight.title, cardX + 12, cardY + 22, { width: cardWidth - 24, height: 13, ellipsis: true });

      doc.fontSize(8).fillColor(colors.textLight);
      doc.text(insight.description, cardX + 12, cardY + 40, { width: cardWidth - 24, height: 22, ellipsis: true, lineGap: 2 });
    });

    const numRows = Math.ceil(Math.min(insights.insights.length, 4) / 2);
    y += numRows * (cardHeight + 10) + 10;
  }

  // Recommendations
  if (insights.recommendations?.length > 0) {
    doc.fontSize(11).fillColor(colors.primary);
    safeText(doc, "Recommendations", PAGE.margin, y);
    y += 18;

    const numRecs = Math.min(insights.recommendations.length, 3);
    const recCardHeight = numRecs * 22 + 16;
    drawRoundedRect(doc, PAGE.margin, y, PAGE.contentWidth, recCardHeight, 6, colors.background);

    let recY = y + 10;
    insights.recommendations.slice(0, 3).forEach((rec, i) => {
      drawRoundedRect(doc, PAGE.margin + 12, recY - 2, 18, 18, 9, colors.primary);
      doc.fontSize(9).fillColor(colors.white);
      safeText(doc, `${i + 1}`, PAGE.margin + 18, recY + 1);

      doc.fontSize(9).fillColor(colors.text);
      doc.text(rec, PAGE.margin + 38, recY, { width: PAGE.contentWidth - 60 });
      recY += 22;
    });

    y += recCardHeight + 15;
  }

  return y;
}

function drawFooter(doc, pageNum) {
  const footerY = PAGE.height - 35;

  doc.moveTo(PAGE.margin, footerY).lineTo(PAGE.width - PAGE.margin, footerY).strokeColor(colors.border).lineWidth(0.5).stroke();

  doc.fontSize(8).fillColor(colors.textMuted);
  safeText(doc, "MCA Call Management System", PAGE.margin, footerY + 8);
  safeText(doc, `Page ${pageNum}`, PAGE.width - PAGE.margin - 40, footerY + 8);
}

async function generatePDF(stats, insights) {
  return new Promise((resolve, reject) => {
    try {
      // Create document WITHOUT auto page management
      const doc = new PDFDocument({
        size: "A4",
        margin: PAGE.margin,
        autoFirstPage: false, // We'll manage pages manually
        bufferPages: false,
        info: {
          Title: "Call Analytics Report",
          Author: "MCA Call Management System",
          Subject: `Analytics Report - ${stats.period?.days || 30} days`,
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ========== PAGE 1 ==========
      doc.addPage();
      let y = drawHeader(doc, stats.period?.days);
      y = drawKPISection(doc, stats, y);
      y = drawDirectionAndStatus(doc, stats, y);
      y = drawPeakHours(doc, stats, y);
      drawFooter(doc, 1);

      // ========== PAGE 2 (only if AI insights exist) ==========
      const hasInsights = insights?.insights?.length > 0 || insights?.summary;
      if (hasInsights) {
        doc.addPage();
        drawAIInsights(doc, insights, 50);
        drawFooter(doc, 2);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generatePDF, colors, formatDuration, formatDurationLong, formatNumber };
