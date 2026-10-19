-- Süreli sınav oturumları: başlangıç zamanı sunucuda tutulur, gönderimde süre sınırı doğrulanır.
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  quiz_id      INT UNSIGNED NOT NULL,
  started_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_quiz_sessions_user_quiz (user_id, quiz_id),
  CONSTRAINT fk_quiz_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_quiz_sessions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
