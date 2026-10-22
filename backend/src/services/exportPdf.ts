import PDFDocument from "pdfkit";
import { FormRecord, FormStats, TeamWithMembers } from "../db/repository";
import { compareRollNumbers } from "../utils/csv";

export async function generateFormPdfBuffer(
  form: FormRecord,
  stats: FormStats,
  responses: TeamWithMembers[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 55, left: 40, right: 40 },
      bufferPages: true,
      info: {
        Title: `${form.title} - Team Registration Report`,
        Author: "Team Registration Platform",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width; // 595.28
    const pageHeight = doc.page.height; // 841.89
    const marginLeft = 40;
    const contentWidth = pageWidth - 80; // 515.28
    const maxContentY = pageHeight - 62;

    const generatedAt = new Date().toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const teamSizeText =
      form.min_team_size === form.max_team_size
        ? `${form.min_team_size}`
        : `${form.min_team_size}–${form.max_team_size}`;

    // -------------------------------------------------------------------------
    // 1. Document Header Banner
    // -------------------------------------------------------------------------
    doc.save();
    doc.roundedRect(marginLeft, 36, contentWidth, 68, 8).fill("#1E1B4B");
    doc.restore();

    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(form.title, marginLeft + 18, 48, {
        width: contentWidth - 175,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .fillColor("#C4B5FD")
      .font("Helvetica")
      .fontSize(9.5)
      .text(
        form.description
          ? `${form.description}  •  Team Size: ${teamSizeText}`
          : `Public URL: /f/${form.slug}  •  Team Size: ${teamSizeText}  •  Status: ${
              form.is_open ? "Open" : "Closed"
            }`,
        marginLeft + 18,
        72,
        {
          width: contentWidth - 175,
          lineBreak: false,
          ellipsis: true,
        }
      );

    doc
      .fillColor("#E2E8F0")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("GENERATED ON", marginLeft + contentWidth - 150, 50, {
        width: 134,
        align: "right",
      });
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica")
      .fontSize(9)
      .text(generatedAt, marginLeft + contentWidth - 150, 63, {
        width: 134,
        align: "right",
      });
    doc
      .fillColor("#A78BFA")
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(`TEAM SIZE: ${teamSizeText}`, marginLeft + contentWidth - 150, 80, {
        width: 134,
        align: "right",
      });

    // -------------------------------------------------------------------------
    // 2. Summary Box (Total Teams, Boys, Girls, Total Students)
    // -------------------------------------------------------------------------
    const summaryY = 116;
    const summaryHeight = 52;
    doc.save();
    doc
      .roundedRect(marginLeft, summaryY, contentWidth, summaryHeight, 6)
      .fillAndStroke("#F8FAFC", "#CBD5E1");
    doc.restore();

    const summaryItems = [
      { label: "TOTAL TEAMS", value: String(stats.teams), color: "#4338CA" },
      { label: "BOYS (M)", value: String(stats.boys), color: "#0284C7" },
      { label: "GIRLS (F)", value: String(stats.girls), color: "#DB2777" },
      {
        label: "TOTAL STUDENTS",
        value: stats.classTotal > 0 ? `${stats.total} / ${stats.classTotal}` : String(stats.total),
        color: "#059669",
      },
    ];

    const boxColWidth = contentWidth / summaryItems.length;
    summaryItems.forEach((item, idx) => {
      const colX = marginLeft + idx * boxColWidth;
      if (idx > 0) {
        doc.save();
        doc
          .moveTo(colX, summaryY + 10)
          .lineTo(colX, summaryY + summaryHeight - 10)
          .strokeColor("#E2E8F0")
          .lineWidth(1)
          .stroke();
        doc.restore();
      }

      doc
        .fillColor("#64748B")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(item.label, colX + 8, summaryY + 10, {
          width: boxColWidth - 16,
          align: "center",
        });

      doc
        .fillColor(item.color)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(item.value, colX + 8, summaryY + 25, {
          width: boxColWidth - 16,
          align: "center",
        });
    });

    // -------------------------------------------------------------------------
    // 3. Clean Table (Team No, Roll No, Name, Topic if enabled)
    // -------------------------------------------------------------------------
    const hasTopic = Boolean(form.collect_topic);
    const cols = hasTopic
      ? [
          { header: "Team No", width: 62, align: "center" as const },
          { header: "Roll No", width: 92, align: "center" as const },
          { header: "Name", width: 186, align: "left" as const },
          { header: "Topic", width: 175.28, align: "center" as const },
        ]
      : [
          { header: "Team No", width: 80, align: "center" as const },
          { header: "Roll No", width: 135, align: "center" as const },
          { header: "Name", width: 300.28, align: "left" as const },
        ];

    const tableHeaderHeight = 24;
    const baseRowHeight = 21;

    function drawTableHeader(y: number): number {
      doc.save();
      doc.rect(marginLeft, y, contentWidth, tableHeaderHeight).fill("#312E81");
      doc.restore();

      let curX = marginLeft;
      for (const col of cols) {
        doc
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .text(col.header, curX + 8, y + 7, {
            width: col.width - 16,
            align: col.align,
            lineBreak: false,
          });
        curX += col.width;
      }

      return y + tableHeaderHeight;
    }

    let currentY = drawTableHeader(summaryY + summaryHeight + 16);

    const sortedTeams = [...responses].sort((a, b) => a.team_no - b.team_no);

    if (sortedTeams.length === 0) {
      doc.save();
      doc
        .rect(marginLeft, currentY, contentWidth, 44)
        .fillAndStroke("#FFFFFF", "#CBD5E1");
      doc.restore();
      doc
        .fillColor("#64748B")
        .font("Helvetica")
        .fontSize(10)
        .text("No teams have registered for this form yet.", marginLeft, currentY + 16, {
          width: contentWidth,
          align: "center",
        });
    } else {
      sortedTeams.forEach((team, teamIdx) => {
        const members =
          team.members.length > 0
            ? [...team.members].sort((a, b) =>
                a.position !== b.position
                  ? a.position - b.position
                  : compareRollNumbers(a.roll_no, b.roll_no)
              )
            : [{ roll_no: "-", name: "-", gender: "M" as const, position: 1 }];

        // Compute height needed for each member row & topic cell so no text is cut off
        doc.font("Helvetica").fontSize(9);
        const memberHeights = members.map((m) => {
          const nameH = doc.heightOfString(m.name || "-", {
            width: cols[2].width - 16,
          });
          return Math.max(baseRowHeight, Math.ceil(nameH) + 10);
        });

        let totalMembersHeight = memberHeights.reduce((acc, h) => acc + h, 0);

        if (hasTopic && team.topic) {
          const topicH = doc.heightOfString(team.topic, {
            width: cols[3].width - 16,
          });
          const minTopicBlockH = Math.ceil(topicH) + 12;
          if (minTopicBlockH > totalMembersHeight) {
            const extraPerRow = (minTopicBlockH - totalMembersHeight) / memberHeights.length;
            for (let i = 0; i < memberHeights.length; i++) {
              memberHeights[i] += extraPerRow;
            }
            totalMembersHeight = minTopicBlockH;
          }
        }

        // Avoid splitting a team across pages whenever it can fit on a new page
        if (currentY + totalMembersHeight > maxContentY && totalMembersHeight <= maxContentY - 70) {
          doc.addPage();
          currentY = drawTableHeader(40);
        }

        const isEvenTeam = teamIdx % 2 === 1;
        const teamBg = isEvenTeam ? "#F5F3FF" : "#FFFFFF";
        const blockStartY = currentY;

        // Draw team background block
        doc.save();
        doc.rect(marginLeft, blockStartY, contentWidth, totalMembersHeight).fill(teamBg);
        doc.restore();

        const xCol0 = marginLeft;
        const xCol1 = xCol0 + cols[0].width;
        const xCol2 = xCol1 + cols[1].width;
        const xCol3 = xCol2 + cols[2].width;

        // Draw each member row (Roll No & Name) and internal horizontal dividers for Roll No & Name columns
        let rowY = blockStartY;
        members.forEach((member, mIdx) => {
          const rh = memberHeights[mIdx];

          if (mIdx > 0) {
            doc.save();
            doc
              .moveTo(xCol1, rowY)
              .lineTo(xCol3, rowY)
              .strokeColor("#E2E8F0")
              .lineWidth(0.5)
              .stroke();
            doc.restore();
          }

          // Roll No
          doc
            .fillColor("#0F172A")
            .font("Helvetica-Bold")
            .fontSize(9)
            .text(member.roll_no, xCol1 + 8, rowY + (rh - 10) / 2, {
              width: cols[1].width - 16,
              align: "center",
              lineBreak: false,
            });

          // Name
          const nameHeight = doc
            .font("Helvetica")
            .fontSize(9)
            .heightOfString(member.name, { width: cols[2].width - 16 });
          doc
            .fillColor("#1E293B")
            .font("Helvetica")
            .fontSize(9)
            .text(member.name, xCol2 + 8, rowY + Math.max(4, (rh - nameHeight) / 2), {
              width: cols[2].width - 16,
              align: "left",
            });

          rowY += rh;
        });

        // Spanning Team No cell (shown once per team, vertically centered across team block)
        doc
          .fillColor("#1E1B4B")
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(String(team.team_no), xCol0 + 6, blockStartY + (totalMembersHeight - 10) / 2, {
            width: cols[0].width - 12,
            align: "center",
            lineBreak: false,
          });

        // Spanning Topic cell (if collect_topic is enabled, shown once per team, vertically centered)
        if (hasTopic) {
          const topicStr = team.topic || "-";
          const topicTextHeight = doc
            .font("Helvetica")
            .fontSize(9)
            .heightOfString(topicStr, { width: cols[3].width - 16, align: "center" });
          doc
            .fillColor("#1E293B")
            .font("Helvetica")
            .fontSize(9)
            .text(
              topicStr,
              xCol3 + 8,
              blockStartY + Math.max(4, (totalMembersHeight - topicTextHeight) / 2),
              {
                width: cols[3].width - 16,
                align: "center",
              }
            );
        }

        // Draw vertical column lines & outer team block border
        doc.save();
        doc.strokeColor("#CBD5E1").lineWidth(0.6);

        // Outer box of the team block
        doc.rect(marginLeft, blockStartY, contentWidth, totalMembersHeight).stroke();

        // Vertical dividers
        doc
          .moveTo(xCol1, blockStartY)
          .lineTo(xCol1, blockStartY + totalMembersHeight)
          .stroke();
        doc
          .moveTo(xCol2, blockStartY)
          .lineTo(xCol2, blockStartY + totalMembersHeight)
          .stroke();
        if (hasTopic) {
          doc
            .moveTo(xCol3, blockStartY)
            .lineTo(xCol3, blockStartY + totalMembersHeight)
            .stroke();
        }
        doc.restore();

        currentY = blockStartY + totalMembersHeight;
      });
    }

    // -------------------------------------------------------------------------
    // 4. Footer with "Page X of Y" on Every Page
    // -------------------------------------------------------------------------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const footerY = pageHeight - 36;
      doc.save();
      doc
        .moveTo(marginLeft, footerY - 6)
        .lineTo(marginLeft + contentWidth, footerY - 6)
        .strokeColor("#E2E8F0")
        .lineWidth(0.75)
        .stroke();
      doc.restore();

      doc
        .fillColor("#64748B")
        .font("Helvetica")
        .fontSize(8.5)
        .text(`${form.title}  •  Team Registration Report`, marginLeft, footerY, {
          width: contentWidth / 2,
          align: "left",
          lineBreak: false,
        });

      doc
        .fillColor("#475569")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(`Page ${i + 1} of ${range.count}`, marginLeft + contentWidth / 2, footerY, {
          width: contentWidth / 2,
          align: "right",
          lineBreak: false,
        });

      doc.page.margins.bottom = oldBottomMargin;
    }

    doc.end();
  });
}
