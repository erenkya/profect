-- Sınav ilerlemesi: öğrenci sonraki soruya geçtikçe cevaplar oturuma yazılır; sayfayı yenileyen ya da
-- dönen öğrenci aynı soru/şık sırasıyla, cevapları dolu olarak devam eder. Oturumlar artık süresiz sınavlarda da açılır.
ALTER TABLE quiz_sessions
  ADD COLUMN question_order JSON NULL AFTER submitted_at,
  ADD COLUMN draft_answers JSON NULL AFTER question_order;
