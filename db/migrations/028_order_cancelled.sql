-- Sipariş sahibi, onay bekleyen (pending) siparişini kendisi iptal edebilir.
--   orders.status → 'cancelled': kullanıcı iptal etti (yönetici reddinden 'rejected' ayrı tutulur)
-- Yalnızca ENUM'a değer ekler; mevcut satırlar değişmez.
ALTER TABLE orders
  MODIFY COLUMN status ENUM('pending','paid','rejected','refunded','cancelled') NOT NULL DEFAULT 'pending';
