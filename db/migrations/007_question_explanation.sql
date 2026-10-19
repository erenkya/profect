-- Soru açıklaması: öğrenci soruyu yanlış cevaplarsa sonuçta gösterilir.
ALTER TABLE questions ADD COLUMN explanation TEXT NULL AFTER question_text;
