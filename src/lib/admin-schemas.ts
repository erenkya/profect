import { z } from "zod";
import { MAX_VIDEO_BYTES, isVideoKey } from "./video-key.ts";
import { MAX_COVER_BYTES, isCoverKey, isCoverType } from "./cover-key.ts";

const money = z.coerce.number().min(0).max(1_000_000);

export const courseFields = {
  title: z.string().trim().min(2).max(255),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/, "Yalnızca küçük harf, rakam ve tire."),
  code: z.string().trim().min(2).max(30),
  description: z.string().trim().min(1),
  category: z.string().trim().max(80),
  level: z.string().trim().max(30),
  instructor: z.string().trim().max(150),
  hours: z.coerce.number().int().min(0).max(10000),
  rating: z.coerce.number().min(0).max(9.9).nullable(),
  price: money,
  old_price: money.nullable(),
  outcomes: z.array(z.string().trim().min(1)).max(20),
  thumbnail_url: z.string().trim().max(255).refine(isCoverKey, "Geçersiz kapak resmi.").nullable(), // R2 nesne anahtarı
  is_published: z.boolean(),
  sort_order: z.coerce.number().int(),
};

export const createCourseSchema = z.object({
  title: courseFields.title,
  slug: courseFields.slug.optional(),
  code: courseFields.code.optional(),
  description: courseFields.description,
  category: courseFields.category.optional(),
  level: courseFields.level.optional(),
  instructor: courseFields.instructor.optional(),
  hours: courseFields.hours.optional(),
  price: courseFields.price.optional(),
  old_price: courseFields.old_price.optional(),
  outcomes: courseFields.outcomes.optional(),
});

export const updateCourseSchema = z.object(courseFields).partial();

export const lessonSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    lesson_type: z.enum(["video", "text"]),
    content: z.string().min(1, "İçerik boş olamaz."), // video: R2 nesne anahtarı · text: Markdown
    duration_minutes: z.coerce.number({ invalid_type_error: "Ders süresi zorunlu." }).int().min(1, "Ders süresi en az 1 dk olmalı.").max(100000),
  })
  .superRefine((d, ctx) => {
    if (d.lesson_type === "video" && !isVideoKey(d.content)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["content"], message: "Geçersiz video." });
    }
  });

/** Yönetici video yüklemesi başlatırken gönderilir (dosyanın kendisi değil, meta bilgisi). */
export const videoUploadSchema = z.object({
  module_id: z.coerce.number().int().positive(),
  lesson_title: z.string().trim().min(1).max(255),
  content_type: z.literal("video/mp4", { errorMap: () => ({ message: "Yalnızca MP4 yüklenebilir." }) }),
  size: z.number().int().min(1).max(MAX_VIDEO_BYTES, "Video en çok 2 GB olabilir."),
});

// — Sınav soruları: tek cevaplı, çok cevaplı, sürükle-bırak (categorize) ve senaryo —
const questionText = z.string().trim().min(1, "Soru metni boş olamaz.");
const explanation = z.string().trim().max(5000, "Açıklama en çok 5000 karakter olabilir.").optional(); // yanlış cevaplayana gösterilir
const choiceOptions = z
  .array(z.object({ option_text: z.string().trim().min(1, "Şık metni boş olamaz."), is_correct: z.boolean() }))
  .min(2, "Her soruda en az 2 şık olmalı.")
  .max(12, "Bir soruda en çok 12 şık olabilir.");

const singleQ = z.object({ kind: z.literal("single"), question_text: questionText, explanation, options: choiceOptions });
const multipleQ = z.object({ kind: z.literal("multiple"), question_text: questionText, explanation, options: choiceOptions });
const categorizeQ = z.object({
  kind: z.literal("categorize"),
  question_text: questionText,
  explanation,
  categories: z.array(z.string().trim().min(1, "Kategori adı boş olamaz.").max(500)).min(2, "En az 2 kategori olmalı.").max(8, "En çok 8 kategori olabilir."),
  cards: z
    .array(z.object({ card_text: z.string().trim().min(1, "Kart metni boş olamaz."), category_index: z.number().int().min(0, "Her kartın bir kategorisi olmalı.") }))
    .min(2, "En az 2 kart olmalı.")
    .max(30, "En çok 30 kart olabilir."),
});

/** Doğru şık / kategori kuralları (discriminatedUnion üyeleri refine taşıyamadığı için ayrı). */
function checkQuestion(q: z.infer<typeof singleQ> | z.infer<typeof multipleQ> | z.infer<typeof categorizeQ>, ctx: z.RefinementCtx) {
  if (q.kind === "single" && q.options.filter((o) => o.is_correct).length !== 1) {
    ctx.addIssue({ code: "custom", message: "Tek cevaplı soruda tam olarak 1 doğru şık olmalı." });
  }
  if (q.kind === "multiple" && !q.options.some((o) => o.is_correct)) {
    ctx.addIssue({ code: "custom", message: "Çok cevaplı soruda en az bir doğru şık olmalı." });
  }
  if (q.kind === "categorize") {
    if (q.cards.some((c) => c.category_index >= q.categories.length)) ctx.addIssue({ code: "custom", message: "Her kartın bir kategorisi olmalı." });
    else if (q.categories.some((_, i) => !q.cards.some((c) => c.category_index === i))) ctx.addIssue({ code: "custom", message: "Her kategoride en az bir kart olmalı." });
  }
}

// kind belirtilmeyen (eski) soru girdisi tek cevaplı sayılır.
const withDefaultKind = (v: unknown) => (v && typeof v === "object" && !("kind" in v) ? { ...v, kind: "single" } : v);

const scenarioChild = z.preprocess(withDefaultKind, z.discriminatedUnion("kind", [singleQ, multipleQ]).superRefine(checkQuestion));
const scenarioQ = z.object({
  kind: z.literal("scenario"),
  scenario_text: z.string().trim().min(1, "Senaryo metni boş olamaz."),
  scenario_prompt: z.string().trim().max(5000).optional(),
  questions: z.array(scenarioChild).min(1, "Senaryoda en az bir soru olmalı.").max(20, "Bir senaryoda en çok 20 soru olabilir."),
});

export const quizItemSchema = z.preprocess(
  withDefaultKind,
  z.discriminatedUnion("kind", [singleQ, multipleQ, categorizeQ, scenarioQ]).superRefine((q, ctx) => {
    if (q.kind !== "scenario") checkQuestion(q, ctx);
  }),
);

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(255),
  passing_score_percentage: z.coerce.number().int().min(1).max(100).default(70),
  duration_minutes: z.coerce.number({ invalid_type_error: "Sınav süresi zorunlu." }).int().min(1, "Sınav süresi en az 1 dk olmalı.").max(100000),
  questions: z.array(quizItemSchema).max(200),
});

export const reorderSchema = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(500) });

/** Yönetici kapak resmi yüklemesi başlatırken gönderilir (dosyanın kendisi değil, meta bilgisi). */
export const coverUploadSchema = z.object({
  course_id: z.coerce.number().int().positive(),
  content_type: z.string().refine(isCoverType, "Yalnızca JPG, PNG veya WebP yüklenebilir."),
  size: z.number().int().min(1).max(MAX_COVER_BYTES, "Kapak resmi en çok 5 MB olabilir."),
});
