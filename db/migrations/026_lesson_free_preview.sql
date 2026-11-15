-- Ücretsiz önizleme artık ders bazında seçilir (yönetim panelinden). Varsayılan: kapalı.
ALTER TABLE lessons ADD COLUMN is_free_preview TINYINT(1) NOT NULL DEFAULT 0 AFTER sort_order;

-- Başlangıç durumu: yalnızca "Stratejik Satın Almanın Temelleri" kursunun müfredat sırasındaki ilk dersi.
UPDATE lessons SET is_free_preview = 1
 WHERE id = (
   SELECT id FROM (
     SELECT l.id FROM lessons l
       JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id
      WHERE c.title = 'Stratejik Satın Almanın Temelleri'
      ORDER BY m.sort_order, m.id, l.sort_order, l.id LIMIT 1
   ) first_lesson
 );
