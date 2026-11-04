import { z } from "zod";
import { MAX_VIDEO_BYTES, isVideoKey } from "./video-key.ts";
import { MAX_COVER_BYTES, isCoverKey, isCoverType } from "./cover-key.ts";
import { MAX_POST_IMAGE_BYTES, isPostImageKey, isPostImageType } from "./post-key.ts";
import { validatePool } from "./quiz-pool.ts";
import { MAX_LESSON_FILE_BYTES, cleanFileName, isBlockedFileName, isLessonFileKey } from "./lesson-file.ts";

const money = z.coerce.number().min(0).max(1_000_000);

export const courseFields = {
  title: z.string().trim().min(2).max(255),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/, "Yalnızca küçük harf, rakam ve tire."),
  code: z.string().trim().min(2).max(30),
  description: z.string().trim().min(1),
  category: z.string().trim().max(80),
  level: z.string().trim().max(30),
  instructor: z.string().trim().max(150),
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
  price: courseFields.price.optional(),
  old_price: courseFields.old_price.optional(),
  outcomes: courseFields.outcomes.optional(),
});

export const updateCourseSchema = z.object(courseFields).partial();

// — Uzmanlık programı (kurs paketi) —
const programFields = {
  title: courseFields.title,
  slug: courseFields.slug,
  code: courseFields.code,
  description: courseFields.description,
  category: courseFields.category,
  price: money, // B: programın kendi sabit fiyatı
  course_ids: z.array(z.coerce.number().int().positive()).min(1, "Programda en az bir kurs olmalı.").max(50, "Bir programda en çok 50 kurs olabilir."), // dizi sırası = roadmap sırası
  thumbnail_url: courseFields.thumbnail_url,
  is_published: courseFields.is_published,
  sort_order: courseFields.sort_order,
};

/** Aynı kurs iki kez eklenemez (program_courses PK'si). */
const uniqueCourseIds = (d: { course_ids?: number[] }, ctx: z.RefinementCtx) => {
  if (d.course_ids && new Set(d.course_ids).size !== d.course_ids.length) ctx.addIssue({ code: "custom", path: ["course_ids"], message: "Aynı kurs bir programa iki kez eklenemez." });
};

export const createProgramSchema = z
  .object({
    title: programFields.title,
    slug: programFields.slug.optional(),
    code: programFields.code.optional(),
    description: programFields.description,
    category: programFields.category.optional(),
    price: programFields.price,
    course_ids: programFields.course_ids,
  })
  .superRefine(uniqueCourseIds);

export const updateProgramSchema = z.object(programFields).partial().superRefine(uniqueCourseIds);

export const lessonSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    lesson_type: z.enum(["video", "text"]),
    content: z.string().min(1, "İçerik boş olamaz."), // video: R2 nesne anahtarı · text: Markdown
    duration_minutes: z.coerce.number({ invalid_type_error: "Ders süresi zorunlu." }).int().min(1, "Ders süresi en az 1 dk olmalı.").max(100000),
    instructor_id: z.number().int().positive().nullable().default(null), // boşsa soru bildirimi yöneticilere gider
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

// — Ders dosyaları (indirilebilir ekler) —
const lessonFileName = z.string().min(1, "Dosya adı boş olamaz.").max(255, "Dosya adı en çok 255 karakter olabilir.");
const lessonFileTitle = z.string().trim().min(1, "Görünen ad boş olamaz.").max(120, "Görünen ad en çok 120 karakter olabilir.");

/** Dosya yüklemesini başlatırken gönderilir (dosyanın kendisi değil, meta bilgisi). */
export const lessonFileUploadSchema = z.object({
  file_name: lessonFileName.refine((n) => !isBlockedFileName(n), "Bu dosya türü yüklenemez."),
  size: z.number().int().min(1, "Dosya boş olamaz.").max(MAX_LESSON_FILE_BYTES, "Dosya en çok 150 MB olabilir."),
});

/** R2'ye yükleme bittikten sonra dosyayı derse kaydeder (boyut sunucuda R2'den okunur). */
export const lessonFileRegisterSchema = z.object({
  key: z.string().refine(isLessonFileKey, "Geçersiz dosya."),
  title: lessonFileTitle,
  file_name: lessonFileName.refine((n) => !isBlockedFileName(cleanFileName(n)), "Bu dosya türü yüklenemez."),
  content_type: z.string().max(127),
});

export const lessonFileRenameSchema = z.object({ title: lessonFileTitle });

// — Sınav soruları: tek cevaplı, çok cevaplı, sürükle-bırak (categorize) ve senaryo —
const questionText = z.string().trim().min(1, "Soru metni boş olamaz.");
const explanation = z.string().trim().max(5000, "Açıklama en çok 5000 karakter olabilir.").optional(); // yanlış cevaplayana gösterilir
const choiceOptions = z
  .array(z.object({ option_text: z.string().trim().min(1, "Şık metni boş olamaz."), is_correct: z.boolean() }))
  .min(2, "Her soruda en az 2 şık olmalı.")
  .max(12, "Bir soruda en çok 12 şık olabilir.");

const isRequired = z.boolean().default(false); // havuz modunda her sınavda mutlaka çıkar
const singleQ = z.object({ kind: z.literal("single"), question_text: questionText, explanation, is_required: isRequired, options: choiceOptions });
const multipleQ = z.object({ kind: z.literal("multiple"), question_text: questionText, explanation, is_required: isRequired, options: choiceOptions });
const categorizeQ = z.object({
  kind: z.literal("categorize"),
  question_text: questionText,
  explanation,
  is_required: isRequired,
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

// Üst sınır yalnızca taşmayı önler: gerçek sınır havuz doğrulamasındadır; sabit modda gizli kalan eski değerler kaydı engellememeli.
const poolQuota = z.number().int().min(1, "Tip kotası en az 1 olmalı.").max(100000).optional();

export const quizBaseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  passing_score_percentage: z.coerce.number().int().min(1).max(100).default(70),
  duration_minutes: z.coerce.number({ invalid_type_error: "Sınav süresi zorunlu." }).int().min(1, "Sınav süresi en az 1 dk olmalı.").max(100000),
  mode: z.enum(["fixed", "pool"]).default("fixed"),
  draw_count: z.number().int().min(1, "Gösterilecek soru sayısı en az 1 olmalı.").max(100000).nullable().default(null), // null = havuzun tamamı
  draw_by_type: z.object({ single: poolQuota, multiple: poolQuota, categorize: poolQuota }).strict().default({}),
  questions: z.array(quizItemSchema).max(200),
});

/** Havuz modunda ayarlar sorulara göre tutarlı olmalı (senaryo alt soruları kendi tipiyle sayılır). Sabit modda havuz alanları yok sayılır. */
export const quizSchema = quizBaseSchema.superRefine((d, ctx) => {
  if (d.mode !== "pool") return;
  const flat = d.questions.flatMap((q) => (q.kind === "scenario" ? q.questions : [q])).map((q) => ({ kind: q.kind, required: q.is_required }));
  for (const message of validatePool(flat, { drawCount: d.draw_count, byType: d.draw_by_type })) ctx.addIssue({ code: "custom", path: ["draw_count"], message });
});

export const reorderSchema = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(500) });

/** Yönetici kapak resmi yüklemesi başlatırken gönderilir (dosyanın kendisi değil, meta bilgisi). */
export const coverUploadSchema = z.object({
  course_id: z.coerce.number().int().positive(),
  content_type: z.string().refine(isCoverType, "Yalnızca JPG, PNG veya WebP yüklenebilir."),
  size: z.number().int().min(1).max(MAX_COVER_BYTES, "Kapak resmi en çok 5 MB olabilir."),
});

/** Yönetici blog/haber görseli yüklemesi başlatırken gönderilir (dosyanın kendisi değil, meta bilgisi). */
export const postImageUploadSchema = z.object({
  content_type: z.string().refine(isPostImageType, "Yalnızca JPG, PNG, WebP veya GIF yüklenebilir."),
  size: z.number().int().min(1).max(MAX_POST_IMAGE_BYTES, "Görsel en çok 8 MB olabilir."),
});

export const postFields = {
  type: z.enum(["blog", "news"]),
  title: z.string().trim().min(2, "Başlık en az 2 karakter olmalı.").max(200),
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9-]+$/, "Adres yalnızca küçük harf, rakam ve tire içerebilir."),
  excerpt: z.string().trim().max(400, "Özet en çok 400 karakter olabilir."),
  content: z.string().max(300_000, "İçerik çok uzun."),
  cover_key: z.string().refine(isPostImageKey, "Geçersiz kapak görseli.").nullable(), // R2 nesne anahtarı
  author: z.string().trim().min(1).max(150),
  status: z.enum(["draft", "published"]),
  published_at: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, "Geçersiz yayın tarihi.").nullable(),
};

export const createPostSchema = z.object(postFields).partial({ slug: true, excerpt: true, cover_key: true, author: true, published_at: true });
export const updatePostSchema = z.object(postFields).partial();
