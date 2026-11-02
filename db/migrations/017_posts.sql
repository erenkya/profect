-- Blog ve haberler tek tabloda: `type` hangi bölümde görüneceğini belirler.
--   content   → Markdown (görseller /api/gorsel/<ad> adresiyle gömülür; dosyalar ayrı R2 bucket'ında: R2_BLOG_BUCKET)
--   cover_key → kapak görselinin R2 anahtarı (gorseller/<16 hex>.<uzantı>), yoksa NULL
--   status    → draft: yalnızca yönetici görür · published: sitede yayında
--   published_at → listelerde sıralama ve gösterilen tarih; yayına alınınca boşsa doldurulur
CREATE TABLE IF NOT EXISTS posts (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type         ENUM('blog','news') NOT NULL,
  slug         VARCHAR(160) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  excerpt      VARCHAR(400) NOT NULL DEFAULT '',
  content      MEDIUMTEXT   NOT NULL,
  cover_key    VARCHAR(255) NULL,
  author       VARCHAR(150) NOT NULL DEFAULT 'Profect',
  status       ENUM('draft','published') NOT NULL DEFAULT 'draft',
  published_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posts_type_slug (type, slug),
  KEY idx_posts_list (type, status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
