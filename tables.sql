CREATE DATABASE sparta
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE sparta;


CREATE TABLE adena (
  id TINYINT UNSIGNED NOT NULL,
  amount DECIMAL(18,8) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_adena_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 최초 1행(싱글톤) 생성
TRUNCATE TABLE adena;
INSERT INTO adena (id, amount) VALUES (1, 100);


CREATE TABLE bgmusic (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 1,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bgmusic_filename (filename),
  KEY idx_bgmusic_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 예시 데이터
TRUNCATE TABLE bgmusic;
-- INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/00_lineage.mp3', 1);
-- INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/01_Recluse.mp3', 1);
-- INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/the_red_pill_proud_music_preview.mp3', 1);
INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/Eve_Had_A_Dream_Neo(Combined_Mix).mp3', 1);
INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/The_Skull_(Dance_Mix).mp3', 2);
INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/1-55_Chateau_(Part_I_Battle_With_The_Henchmen).mp3', 3);
INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/1-56_Chateau_(Part_II_Three_Doors).mp3', 4);
INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/1-57_Chateau_(Part_III_Lost_In_The_Dungeon).mp3', 5);


CREATE TABLE bglist (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 1,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bglist_filename (filename),
  KEY idx_bglist_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 예시 데이터
TRUNCATE TABLE bglist;
-- INSERT INTO bglist (filename, sort_order) VALUES ('./bglist/background_ep01_00.jpg', 1);
-- INSERT INTO bglist (filename, sort_order) VALUES ('./bglist/background_ep01_01.png', 1);
INSERT INTO bglist (filename, sort_order) VALUES ('./bglist/matrix_ep01_00.gif', 1);


CREATE TABLE history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ts DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  pnl DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_history_ts (ts),
  KEY idx_history_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 예시 데이터(샘플)
INSERT INTO history (ts, amount, pnl) VALUES
('2025-12-28', 34403.05, 0),
('2025-12-29', 34229.23, -173.82),
('2025-12-30', 34289.33, 60.10),
('2025-12-31', 34723.50, 434.17),
('2026-01-02', 34890.72, 167.22),
('2026-01-03', 35027.10, 236.28);


CREATE TABLE history_comment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  history_id BIGINT UNSIGNED NOT NULL,
  body LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_history_comment_history_id (history_id),
  KEY idx_history_comment_created_at (created_at),

  CONSTRAINT fk_history_comment_history
    FOREIGN KEY (history_id) REFERENCES history(id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE history_comment
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL
  ON UPDATE CURRENT_TIMESTAMP;
 
CREATE TABLE chat_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    message TEXT NOT NULL COMMENT '사용자가 입력한 채팅 원문',

    PRIMARY KEY (id),
    INDEX idx_chatlog_created_at (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Matrix User Chat Log (single-user)';

USE sparta;

USE sparta;

CREATE TABLE IF NOT EXISTS rag_doc (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_type VARCHAR(50) NOT NULL,     -- 'history_comment' or 'chat_log'
  source_id BIGINT UNSIGNED NOT NULL,   -- 원본 테이블의 PK
  title VARCHAR(255) NULL,
  content LONGTEXT NOT NULL,
  meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rag_doc_source (source_type, source_id),
  KEY idx_rag_doc_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rag_chunk (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doc_id BIGINT UNSIGNED NOT NULL,
  chunk_no INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  embedding_json JSON NOT NULL,         -- float 배열(JSON)
  token_count INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rag_chunk_doc (doc_id, chunk_no),
  KEY idx_rag_chunk_doc_id (doc_id),
  CONSTRAINT fk_rag_chunk_doc
    FOREIGN KEY (doc_id) REFERENCES rag_doc(id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 네오 디비
USE sparta;

-- Neo 현재 스냅샷(재시작 복구 핵심)
CREATE TABLE IF NOT EXISTS neo_state (
  id INT NOT NULL PRIMARY KEY,
  name VARCHAR(32) NOT NULL DEFAULT 'Neo',

  anchor_real_ms BIGINT NOT NULL,
  anchor_system_min INT NOT NULL,

  last_real_ms BIGINT NOT NULL,
  last_system_min INT NOT NULL,

  system_day INT NOT NULL,
  system_hour TINYINT NOT NULL,
  system_minute TINYINT NOT NULL,

  life_no INT NOT NULL,
  age_years INT NOT NULL,
  day_in_life INT NOT NULL,

  status VARCHAR(24) NOT NULL,
  location VARCHAR(120) NOT NULL,

  last_thought TEXT NULL,
  last_action  TEXT NULL,

  -- ✅ 중복 방지용(필수급)
  last_boundary_system_day INT NOT NULL DEFAULT 1,
  last_event_system_min INT NOT NULL DEFAULT 0,

  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Neo 전체 행적 로그
CREATE TABLE IF NOT EXISTS neo_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,

  real_ms BIGINT NOT NULL,
  system_min INT NOT NULL,
  system_day INT NOT NULL,
  system_hour TINYINT NOT NULL,
  system_minute TINYINT NOT NULL,

  life_no INT NOT NULL,
  age_years INT NOT NULL,
  day_in_life INT NOT NULL,

  kind ENUM('SYSTEM','THOUGHT','MOVE','STATUS') NOT NULL,
  status VARCHAR(24) NOT NULL,

  location_from VARCHAR(120) NULL,
  location_to   VARCHAR(120) NULL,

  message TEXT NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_system_min (system_min),
  KEY idx_life_no (life_no),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB;
