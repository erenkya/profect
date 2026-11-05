-- Şirket eğitimlerinde son tarih (süre). Tüm tarihler UTC `DATETIME`; arayüz Türkiye saatiyle girer ve gösterir.
--   company_assignments.due_at  → çalışana özel son tarih (NULL: süre yok)
--   company_course_deadlines    → şirketin bir eğitimi için, o eğitimi şirket kontenjanıyla alan herkese uygulanan son tarih
-- Geçerli süre ikisinden erken olandır. Süre dolunca, eğitimi bitirmemiş (enrollments.status = 'active') çalışanın erişimi kapanır;
-- atama ve kontenjan olduğu gibi kalır, admin süreyi uzatınca erişim kendiliğinden açılır. Tamamlanmış eğitim hep açıktır.
-- Yalnızca yeni sütun ve tablo ekler; mevcut satırlar değişmez.
ALTER TABLE company_assignments
  ADD COLUMN due_at DATETIME NULL AFTER assigned_at;

CREATE TABLE IF NOT EXISTS company_course_deadlines (
  company_id INT UNSIGNED NOT NULL,
  course_id  INT UNSIGNED NOT NULL,
  due_at     DATETIME     NOT NULL,
  set_by     INT UNSIGNED NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, course_id),
  CONSTRAINT fk_company_deadline_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_deadline_course  FOREIGN KEY (course_id)  REFERENCES courses (id)   ON DELETE CASCADE,
  CONSTRAINT fk_company_deadline_by      FOREIGN KEY (set_by)     REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
