import ExcelJS from "exceljs";
import { FormRecord, FormStats, TeamWithMembers } from "../db/repository";
import { compareRollNumbers } from "../utils/csv";

export async function generateFormExcelBuffer(
  form: FormRecord,
  _stats: FormStats,
  responses: TeamWithMembers[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Team Registration Platform";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Responses", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const hasTopic = Boolean(form.collect_topic);
  const headers = hasTopic
    ? ["team_no", "roll_no", "name", "topic"]
    : ["team_no", "roll_no", "name"];

  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF3B1D9E" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E1B4B" } },
      bottom: { style: "thin", color: { argb: "FF1E1B4B" } },
      left: { style: "thin", color: { argb: "FF1E1B4B" } },
      right: { style: "thin", color: { argb: "FF1E1B4B" } },
    };
  });

  const sortedTeams = [...responses].sort((a, b) => a.team_no - b.team_no);

  sortedTeams.forEach((team, teamIdx) => {
    const sortedMembers =
      team.members.length > 0
        ? [...team.members].sort((a, b) =>
            a.position !== b.position ? a.position - b.position : compareRollNumbers(a.roll_no, b.roll_no)
          )
        : [{ roll_no: "-", name: "-", gender: "M" as const, position: 1 }];

    const startRow = ws.rowCount + 1;
    // Subtle alternating fill per team (not per row)
    const isEvenTeam = teamIdx % 2 === 1;
    const teamFillArgb = isEvenTeam ? "FFF5F3FF" : "FFFFFFFF";

    sortedMembers.forEach((member) => {
      const rowValues: (string | number)[] = hasTopic
        ? [team.team_no, member.roll_no, member.name, team.topic ?? ""]
        : [team.team_no, member.roll_no, member.name];

      const row = ws.addRow(rowValues);
      row.height = 22;

      for (let colIdx = 1; colIdx <= headers.length; colIdx++) {
        const cell = row.getCell(colIdx);
        cell.font = {
          size: 10.5,
          name: "Calibri",
          bold: colIdx === 1,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: teamFillArgb },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: colIdx === 3 ? "left" : "center",
          wrapText: colIdx === 4,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } },
        };
      }
    });

    const endRow = ws.rowCount;
    if (endRow > startRow) {
      ws.mergeCells(startRow, 1, endRow, 1);
      const mergedTeamCell = ws.getCell(startRow, 1);
      mergedTeamCell.alignment = { vertical: "middle", horizontal: "center" };

      if (hasTopic) {
        ws.mergeCells(startRow, 4, endRow, 4);
        const mergedTopicCell = ws.getCell(startRow, 4);
        mergedTopicCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
    }
  });

  // Auto column widths
  ws.columns.forEach((col, idx) => {
    let maxLen = headers[idx]?.length || 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = cell.value !== null && cell.value !== undefined ? String(cell.value) : "";
      if (val.length > maxLen) maxLen = val.length;
    });
    const minWidth = idx === 0 ? 12 : idx === 1 ? 15 : 22;
    col.width = Math.min(Math.max(maxLen + 4, minWidth), 48);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
