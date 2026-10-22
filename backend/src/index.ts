import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { publicRouter } from "./routes/public";
import { adminRouter } from "./routes/admin";
import { errorHandler, AppError } from "./middleware/errorHandler";
import { getClassStats, isUsingLocalFallback, upsertStudents } from "./db/repository";
import { parseClassListCsv } from "./utils/csv";

const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS restricted to frontend origin (+ localhost dev variants)
const allowedOrigins = Array.from(
  new Set([
    config.frontendOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new AppError(403, "CORS_NOT_ALLOWED", `Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Health endpoint
app.get("/health", async (_req, res) => {
  const classStats = await getClassStats().catch(() => ({ total: 0, boys: 0, girls: 0 }));
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    databaseMode: isUsingLocalFallback() ? "local_fallback" : "supabase",
    classStats,
  });
});

// Routes
app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

// 404 handler
app.use((req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found.`));
});

// Central error handler
app.use(errorHandler);

async function autoSeedIfEmpty() {
  try {
    const stats = await getClassStats();
    if (stats.total === 0) {
      const candidatePaths = [
        path.resolve(__dirname, "../../classlist.csv"),
        path.resolve(__dirname, "../classlist.csv"),
      ];
      const csvPath = candidatePaths.find((p) => fs.existsSync(p));
      if (csvPath) {
        const content = fs.readFileSync(csvPath, "utf-8");
        const students = parseClassListCsv(content);
        const seeded = await upsertStudents(students);
        console.log(
          `Seeded ${seeded.total} students (${seeded.boys} boys, ${seeded.girls} girls) from ${path.basename(csvPath)}`
        );
      }
    }
  } catch (err) {
    console.warn("[Startup] Auto-seed check skipped:", err);
  }
}

app.listen(config.port, async () => {
  await autoSeedIfEmpty();
  console.log(`Express backend listening on http://localhost:${config.port}`);
  console.log(`Frontend Origin : ${config.frontendOrigin}`);
});
