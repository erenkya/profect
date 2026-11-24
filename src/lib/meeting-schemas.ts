import { z } from "zod";

const oneLine = (min: number, max: number) =>
  z.string().trim().min(min).max(max).regex(/^[^\r\n\t]+$/, "Tek satırlık metin olmalı.");
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm olmalı.");
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD olmalı.");

export const requestSchema = z.object({
  expert: z.enum(["kaan", "tugrul"]),
  durationMin: z.union([z.literal(15), z.literal(30)]),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/, "Geçersiz saat."),
  fullName: oneLine(2, 100),
  email: z.string().trim().toLowerCase().email().max(190),
  company: oneLine(2, 150),
  jobTitle: oneLine(2, 100),
  turnstileToken: z.string().optional(),
});
export type MeetingRequestInput = z.infer<typeof requestSchema>;

/** Toplantı linki: yalnızca https. */
export const meetingUrlSchema = z.string().trim().max(500).url().refine((u) => u.startsWith("https://"), "Bağlantı https:// ile başlamalı.");

export const respondSchema = z.object({
  action: z.enum(["accept", "decline", "counter", "set_link", "visitor_accept", "visitor_decline", "cancel"]),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/).optional(),
  meetingUrl: meetingUrlSchema.optional(),
  note: oneLine(1, 500).optional(),
});

export const ruleSchema = z
  .object({
    expert: z.enum(["kaan", "tugrul"]),
    kind: z.enum(["available", "blocked"]),
    recurrence: z.enum(["once", "daily", "weekly", "monthly"]),
    date: ymd.nullable().optional(),
    startsOn: ymd.optional(),
    until: ymd.nullable().optional(),
    weekdays: z.number().int().min(0).max(127).default(0),
    startTime: hm,
    endTime: hm,
    note: oneLine(1, 200).nullable().optional(),
  })
  .refine((r) => r.startTime < r.endTime, { message: "Bitiş saati başlangıçtan sonra olmalı.", path: ["endTime"] })
  .refine((r) => r.recurrence !== "once" || !!r.date, { message: "Tek seferlik kural için tarih gerekli.", path: ["date"] })
  .refine((r) => r.recurrence === "once" || !!r.startsOn, { message: "Tekrarlı kural için başlangıç günü gerekli.", path: ["startsOn"] })
  .refine((r) => r.recurrence !== "weekly" || r.weekdays > 0, { message: "En az bir gün seçin.", path: ["weekdays"] });
export type RuleInput = z.infer<typeof ruleSchema>;
