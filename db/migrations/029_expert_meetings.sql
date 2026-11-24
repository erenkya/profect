-- Uzmanlarla görüşme: müsaitlik kuralları, görüşme talepleri ve olay geçmişi.
-- Tarih/saatler İstanbul yerel zamanıdır (DB'de DATETIME/TIME, saat dilimi dönüşümü yok).
CREATE TABLE IF NOT EXISTS expert_availability_rules (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  expert      ENUM('kaan','tugrul') NOT NULL,
  kind        ENUM('available','blocked') NOT NULL,
  recurrence  ENUM('once','daily','weekly','monthly') NOT NULL,
  date        DATE NULL,
  starts_on   DATE NOT NULL,
  until       DATE NULL,
  weekdays    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  note        VARCHAR(200) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rules_expert (expert)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meeting_requests (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  expert              ENUM('kaan','tugrul') NOT NULL,
  duration_min        TINYINT UNSIGNED NOT NULL,
  starts_at           DATETIME NOT NULL,
  ends_at             DATETIME NOT NULL,
  full_name           VARCHAR(100) NOT NULL,
  email               VARCHAR(190) NOT NULL,
  company             VARCHAR(150) NOT NULL,
  job_title           VARCHAR(100) NOT NULL,
  user_id             INT UNSIGNED NULL,
  status              ENUM('pending','counter_proposed','accepted','confirmed','declined','cancelled') NOT NULL DEFAULT 'pending',
  proposed_starts_at  DATETIME NULL,
  meeting_url         VARCHAR(500) NULL,
  decision_note       VARCHAR(500) NULL,
  ics_sequence        INT UNSIGNED NOT NULL DEFAULT 0,
  expert_token_hash   CHAR(64) NOT NULL,
  visitor_token_hash  CHAR(64) NOT NULL,
  token_expires_at    DATETIME NOT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meetings_expert_start (expert, starts_at),
  KEY idx_meetings_email (email, created_at),
  UNIQUE KEY uq_meetings_expert_token (expert_token_hash),
  UNIQUE KEY uq_meetings_visitor_token (visitor_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meeting_request_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id  INT UNSIGNED NOT NULL,
  actor       ENUM('expert','visitor','admin','system') NOT NULL,
  actor_id    INT UNSIGNED NULL,
  action      VARCHAR(40) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status   VARCHAR(20) NULL,
  note        VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
