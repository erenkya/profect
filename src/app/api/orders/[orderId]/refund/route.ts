import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, parseId, serverError } from "@/lib/http";
import { createRefundRequest, notifyRefundRequested } from "@/lib/refund";
import { REFUND_REASON_TEXT } from "@/lib/refund-rules";

const schema = z.object({ reason: z.string().trim().max(500).optional() });

/**
 * Sipariş sahibi iade başvurusu açar. Yetki: yalnızca kendi siparişi (başkasının siparişi ile olmayan sipariş aynı 404).
 * Uygunluk sunucuda yeniden hesaplanır; uygun değilse 409 + engel nedenleri.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const orderId = parseId((await params).orderId);
  if (!orderId) return fail("Sipariş bulunamadı.", 404);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;

  try {
    const r = await createRefundRequest({ userId: guard.payload.userId, orderId, reason: body.data.reason || null });
    if (r.ok) {
      after(() => notifyRefundRequested(r.requestId, getBaseUrl(request)));
      return ok({ requestId: r.requestId }, 201);
    }
    if (r.reason === "not_found") return fail("Sipariş bulunamadı.", 404);
    return NextResponse.json({ success: false, message: REFUND_REASON_TEXT[r.blocks[0]], blocks: r.blocks }, { status: 409 });
  } catch (err) {
    return serverError("[POST /api/orders/:id/refund]", err);
  }
}
