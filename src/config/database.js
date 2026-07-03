const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

// DATABASE_URL is "file:./dev.db" — strip the "file:" prefix for better-sqlite3
const dbUrl = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
const dbPath = path.resolve(__dirname, "../../", dbUrl);

const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
