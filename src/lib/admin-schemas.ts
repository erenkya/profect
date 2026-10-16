import { z } from "zod";

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
  thumbnail_url: z.string().trim().max(255).nullable(),
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

export const lessonSchema = z.object({
  title: z.string().trim().min(1).max(255),
  lesson_type: z.enum(["video", "text"]),
  content: z.string().min(1, "İçerik boş olamaz."),
  duration_minutes: z.coerce.number().int().min(0).max(100000).nullable().optional(),
});

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(255),
  passing_score_percentage: z.coerce.number().int().min(1).max(100).default(70),
  questions: z
    .array(
      z.object({
        question_text: z.string().trim().min(1, "Soru metni boş olamaz."),
        options: z
          .array(z.object({ option_text: z.string().trim().min(1, "Şık metni boş olamaz."), is_correct: z.boolean() }))
          .min(2, "Her soruda en az 2 şık olmalı.")
          .max(8)
          .refine((o) => o.filter((x) => x.is_correct).length === 1, "Her soruda tam olarak 1 doğru şık olmalı."),
      }),
    )
    .max(200),
});

export const reorderSchema = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(500) });
