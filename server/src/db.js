// server/src/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  // ✅ 버그 수정: DB_PASS -> DB_PASSWORD
  // 비번 없으면 "" 로 들어가도 OK
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
});