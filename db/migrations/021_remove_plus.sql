-- Profect Plus kaldırıldı: abonelik bitiş sütunu düşer (artık okunmuyor/yazılmıyor).
-- Kasıtlı olarak DOKUNULMAYANLAR: enrollments.source='plus', orders.plan='plus' ve order_items.item_type='plus' ENUM değerleri ile
-- bu değerleri taşıyan satırlar. Geçmiş siparişler/makbuzlar doğru görünsün, eski Plus kayıtları ilerleme ve sertifika geçmişini korusun diye tutulur.
ALTER TABLE users DROP COLUMN plus_until;
