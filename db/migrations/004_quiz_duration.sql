-- Sınav süresi (dk): sertifikadaki toplam süreye ders sürelerinin yanında sınavlar da eklenir.
ALTER TABLE quizzes ADD COLUMN duration_minutes INT UNSIGNED NULL AFTER passing_score_percentage;
