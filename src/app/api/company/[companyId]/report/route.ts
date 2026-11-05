import writeExcelFile from "write-excel-file/node";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { fail, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { listCompanyProgress } from "@/lib/company-seats";
import { QUIZ_HEADERS, QUIZ_SHEET, QUIZ_WIDTHS, REPORT_HEADERS, REPORT_SHEET, REPORT_WIDTHS, parseUserIds, quizRows, reportFileName, reportRow, selectRows } from "@/lib/progress-report";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Şirketin eğitim ilerleme raporu (.xlsx). `?users=3,5` seçili çalışanları, parametresiz çağrı tüm çalışanları içerir.
 * Satırlar `listCompanyProgress` ile gelir; yani yalnızca bu şirketin aktif atamaları, başka şirketin kimliği dosyaya giremez.
 */
export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const userIds = parseUserIds(new URL(request.url).searchParams.get("users"));
  if (userIds === undefined) return fail("Geçersiz çalışan seçimi.", 400);
  try {
    const [[company], progress] = await Promise.all([
      pool.query<RowDataPacket[]>("SELECT name FROM companies WHERE id = ?", [companyId]).then(([r]) => r),
      listCompanyProgress(companyId),
    ]);
    const rows = selectRows(progress, userIds);
    if (rows.length === 0) return fail("Rapora girecek eğitim ataması yok.", 404);
    const now = new Date();
    const sheet = (name: string, headers: readonly string[], widths: readonly number[], body: (string | number)[][]) => ({
      sheet: name,
      data: [headers.map((value) => ({ value, fontWeight: "bold" as const })), ...body.map((cells) => cells.map((value) => ({ value })))],
      columns: widths.map((width) => ({ width })),
      stickyRowsCount: 1,
    });
    const buffer = await writeExcelFile([
      sheet(REPORT_SHEET, REPORT_HEADERS, REPORT_WIDTHS, rows.map((r) => reportRow(r, now.getTime()))),
      sheet(QUIZ_SHEET, QUIZ_HEADERS, QUIZ_WIDTHS, quizRows(rows)),
    ]).toBuffer();

    const name = reportFileName(company?.name ?? "", now);
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return serverError("[GET /api/company/:id/report]", err);
  }
}
