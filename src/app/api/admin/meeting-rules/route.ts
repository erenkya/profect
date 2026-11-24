import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { isExpertId } from "@/data/experts";
import { createRule, listRules } from "@/lib/meetings";
import { ruleSchema } from "@/lib/meeting-schemas";

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const expert = new URL(request.url).searchParams.get("expert");
  if (expert && !isExpertId(expert)) return fail("Geçersiz uzman.", 400);
  try {
    return ok({ rules: await listRules(expert && isExpertId(expert) ? expert : undefined) });
  } catch (err) {
    return serverError("[GET /api/admin/meeting-rules]", err);
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, ruleSchema);
  if (body.error) return body.error;
  try {
    return ok({ id: await createRule(body.data) });
  } catch (err) {
    return serverError("[POST /api/admin/meeting-rules]", err);
  }
}
