-- Yönetici programa kullanıcı atayabilir (Kayıtlar sayfası): program_enrollments.source'a 'admin' eklenir.
-- Genişletme yalnızca ENUM'a ekler; mevcut satırlar değişmez.
ALTER TABLE program_enrollments
  MODIFY COLUMN source ENUM('purchase','gift','auto','admin') NOT NULL;
