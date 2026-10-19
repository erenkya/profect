-- Deneme cevapları ({ soruId: seçenekId | null }): tamamlanan sınavda öğrenci nerede yanlış yaptığını görebilsin.
ALTER TABLE quiz_attempts ADD COLUMN answers JSON NULL AFTER is_passed;
