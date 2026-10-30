-- Sınav modları: sabit sınav (soru sırası editör sırası) ve soru havuzu (her öğrenciye havuzdan çekilen set).
-- draw_count: havuz modunda gösterilecek soru sayısı (NULL = havuzun tamamı, karışık).
-- draw_by_type: tip kotaları, ör. {"single":5,"multiple":10,"categorize":5}; olmayan anahtar = o tipe kota yok.
ALTER TABLE quizzes
  ADD COLUMN mode ENUM('fixed','pool') NOT NULL DEFAULT 'fixed' AFTER duration_minutes,
  ADD COLUMN draw_count INT UNSIGNED NULL AFTER mode,
  ADD COLUMN draw_by_type JSON NULL AFTER draw_count;

-- Mevcut sınavlar bugünkü davranışını korur: tüm sorular her oturumda karışık gelir (havuz, hepsi).
UPDATE quizzes SET mode = 'pool';

-- Kesin sorular: havuz modunda her öğrencinin sınavında mutlaka yer alır (sabit modda yok sayılır).
ALTER TABLE questions ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0 AFTER position;
