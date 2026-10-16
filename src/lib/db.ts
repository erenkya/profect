import mysql from "mysql2/promise";

// Hot-reload / serverless'ta bağlantı sayısı patlamasın diye havuz global'de tutulur.
const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

const pool =
  globalForDb.mysqlPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: "utf8mb4",
    // Tarihler string gelsin: saat dilimi kaymasıyla uğraşmayalım.
    dateStrings: true,
  });

if (process.env.NODE_ENV !== "production") globalForDb.mysqlPool = pool;

export default pool;
