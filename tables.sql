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
INSERT INTO bgmusic (filename, sort_order) VALUES ('./bgmusic/01_Recluse.mp3', 1);


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
INSERT INTO bglist (filename, sort_order) VALUES ('./bglist/background_ep01_01.png', 1);


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

