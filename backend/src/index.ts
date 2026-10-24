import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { publicRouter } from "./routes/public";
import { adminRouter } from "./routes/admin";
import { errorHandler, AppError } from "./middleware/errorHandler";
import { getClassStats, upsertStudents } from "./db/repository";
import { parseClassListCsv } from "./utils/csv";

const app = express();

// Trust first proxy (required on Render for rate-limiting and client IP resolution)
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS restricted strictly to origin(s) in FRONTEND_ORIGIN (comma-separated, trailing slashes trimmed)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalizedOrigin = origin.trim().replace(/\/+$/, "");
    if (config.frontendOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      callback(new AppError(403, "CORS_NOT_ALLOWED", `Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  optionsSuccessStatus: 204,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json({ limit: "2mb" }));

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
app.get("/health", (_req, res) => {
  res.json({ ok: true });
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

const port = Number(process.env.PORT) || config.port;
app.listen(port, async () => {
  await autoSeedIfEmpty();
  console.log(`Express backend listening on http://localhost:${port}`);
  console.log(`Allowed Frontend Origin(s): ${config.frontendOrigins.join(", ")}`);
});
