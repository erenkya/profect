import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, parseId, serverError } from "@/lib/http";
import { decideRefund, notifyRefundDecision } from "@/lib/refund";

const schema = z
  .object({
    action: z.enum(["approve", "reject", "mark_refunded"]),
    note: z.string().trim().max(500).optional(),
    override: z.boolean().optional(),
  })
  .refine((b) => b.action !== "reject" || !!b.note, { message: "Reddetmek için gerekçe notu zorunlu.", path: ["note"] })
  .refine((b) => !b.override || !!b.note, { message: "Uygunluk dışı onay için gerekçe notu zorunlu.", path: ["note"] });

/** { action: "approve" } onay (+ otomatik sağlayıcıda iade) · "reject" + note · "mark_refunded" (elle ödemede banka iadesi yapıldı). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Geçersiz başvuru.", 400);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const r = await decideRefund({ requestId: id, adminId: guard.payload.userId, ...body.data });
    if (r.ok) {
      // Kullanıcıya yalnızca sonuçlanan kararlar bildirilir (onay beklerken ya da sağlayıcı hatasında mail yok).
      if (r.status === "refunded" || r.status === "rejected") after(() => notifyRefundDecision(id, r.status as "refunded" | "rejected", getBaseUrl(request)));
      if (r.status === "failed") return ok({ status: r.status, message: "Sağlayıcı iadesi başarısız oldu; başvuru hata durumunda, ayrıntı satırda." });
      return ok({ status: r.status });
    }
    switch (r.reason) {
      case "not_found":
        return fail("İade başvurusu bulunamadı.", 404);
      case "note_required":
        return fail("Bu işlem için gerekçe notu zorunlu.", 400);
      case "ineligible":
        return NextResponse.json({ success: false, message: "Başvuru uygunluk kurallarına takılıyor.", blocks: r.blocks }, { status: 409 });
      default:
        return fail("Bu başvuru şu an bu işleme uygun değil.", 409);
    }
  } catch (err) {
    return serverError("[PATCH /api/admin/refunds/:id]", err);
  }
}
