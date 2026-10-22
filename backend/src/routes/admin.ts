import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { config } from "../config";
import {
  createAdmin,
  createForm,
  deleteAdminById,
  deleteForm,
  deleteFormTopic,
  deleteTeamById,
  getAdminByEmail,
  getAdminById,
  getAllStudents,
  getClassStats,
  getFormById,
  getFormResponses,
  getFormStats,
  getFormTopics,
  listAdmins,
  listForms,
  updateAdminPassword,
  updateForm,
  uploadFormTopics,
  upsertStudents,
} from "../db/repository";
import { requireAdmin, requireSuperAdmin } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { generateFormExcelBuffer } from "../services/exportExcel";
import { generateFormPdfBuffer } from "../services/exportPdf";
import { parseClassListCsv, parseTopicsCsv } from "../utils/csv";

export const adminRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TOO_MANY_ATTEMPTS",
    code: "TOO_MANY_ATTEMPTS",
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

const createAdminSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "super_admin"]).optional().default("admin"),
});

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters").optional(),
    password: z.string().min(6, "Password must be at least 6 characters").optional(),
  })
  .refine((d) => Boolean(d.newPassword || d.password), {
    message: "New password (at least 6 characters) is required",
  });

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `form-${Date.now()}`;

const createFormSchema = z
  .object({
    title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
    description: z.string().trim().max(500).optional().nullable(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/i, "Slug may only contain letters, numbers, and hyphens")
      .min(2)
      .max(80)
      .optional(),
    min_team_size: z.coerce.number().int().min(1, "Min team size must be at least 1").max(20, "Max team size is 20"),
    max_team_size: z.coerce.number().int().min(1, "Max team size must be at least 1").max(20, "Max team size is 20"),
    collect_topic: z.boolean().optional().default(false),
    allow_topic_repeat: z.boolean().optional().default(true),
    is_open: z.boolean().optional().default(true),
  })
  .refine((d) => d.min_team_size <= d.max_team_size, {
    message: "Minimum team size cannot exceed maximum team size",
    path: ["min_team_size"],
  });

const updateFormSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/i, "Slug may only contain letters, numbers, and hyphens")
    .min(2)
    .max(80)
    .optional(),
  min_team_size: z.coerce.number().int().min(1).max(20).optional(),
  max_team_size: z.coerce.number().int().min(1).max(20).optional(),
  collect_topic: z.boolean().optional(),
  allow_topic_repeat: z.boolean().optional(),
  is_open: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Auth & Account
// ---------------------------------------------------------------------------

// POST /api/admin/login
adminRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const admin = await getAdminByEmail(email);
    const passMatch = admin ? await bcrypt.compare(password, admin.password_hash) : false;

    if (!admin || !passMatch) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid admin email or password.");
    }

    const payload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: "7d",
    });

    res.cookie("admin_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      ok: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        created_at: admin.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/logout
adminRouter.post("/logout", (_req, res) => {
  res.clearCookie("admin_token", { path: "/" });
  res.json({ ok: true });
});

// GET /api/admin/me
adminRouter.get("/me", requireAdmin, async (req, res, next) => {
  try {
    const classStats = await getClassStats();
    res.json({
      ok: true,
      admin: req.admin,
      classStats,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/change-password
adminRouter.post("/change-password", requireAdmin, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const adminRecord = await getAdminById(req.admin!.id);
    if (!adminRecord) {
      throw new AppError(404, "ADMIN_NOT_FOUND", "Admin account not found.");
    }

    const matches = await bcrypt.compare(currentPassword, adminRecord.password_hash);
    if (!matches) {
      throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await updateAdminPassword(adminRecord.id, newHash);

    res.json({ ok: true, message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Super Admin: Manage Admins
// ---------------------------------------------------------------------------

// GET /api/admin/admins
adminRouter.get("/admins", requireAdmin, requireSuperAdmin, async (_req, res, next) => {
  try {
    const admins = await listAdmins();
    res.json({ admins });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/admins
adminRouter.post("/admins", requireAdmin, requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, password, role } = createAdminSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await createAdmin({
      email,
      passwordHash,
      role,
    });
    res.status(201).json({ admin: created });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/admins/:id
adminRouter.delete("/admins/:id", requireAdmin, requireSuperAdmin, async (req, res, next) => {
  try {
    const targetId = z.string().min(1).parse(req.params.id);
    await deleteAdminById(targetId, req.admin!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/admins/:id/reset-password
adminRouter.post(
  "/admins/:id/reset-password",
  requireAdmin,
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const targetId = z.string().min(1).parse(req.params.id);
      const parsed = resetPasswordSchema.parse(req.body);
      const rawPassword = (parsed.newPassword || parsed.password)!;
      const newHash = await bcrypt.hash(rawPassword, 10);
      await updateAdminPassword(targetId, newHash);
      res.json({ ok: true, message: "Admin password has been reset." });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Forms Management
// ---------------------------------------------------------------------------

// GET /api/admin/forms
adminRouter.get("/forms", requireAdmin, async (_req, res, next) => {
  try {
    const [forms, classStats] = await Promise.all([listForms(), getClassStats()]);
    const formsWithStats = await Promise.all(
      forms.map(async (f) => {
        const stats = await getFormStats(f.id);
        return { ...f, stats };
      })
    );
    res.json({ forms: formsWithStats, classStats });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/forms
adminRouter.post("/forms", requireAdmin, async (req, res, next) => {
  try {
    const parsed = createFormSchema.parse(req.body);
    const slug = parsed.slug ? slugify(parsed.slug) : slugify(parsed.title);

    const form = await createForm({
      slug,
      title: parsed.title,
      description: parsed.description ?? null,
      min_team_size: parsed.min_team_size,
      max_team_size: parsed.max_team_size,
      collect_topic: parsed.collect_topic,
      allow_topic_repeat: parsed.allow_topic_repeat,
      is_open: parsed.is_open,
      created_by: req.admin!.id,
    });

    const stats = await getFormStats(form.id);
    res.status(201).json({ form: { ...form, stats } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/forms/:id
adminRouter.patch("/forms/:id", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    const patch = updateFormSchema.parse(req.body);
    if (patch.slug) {
      patch.slug = slugify(patch.slug);
    }

    const updated = await updateForm(formId, patch);
    const stats = await getFormStats(updated.id);
    res.json({ form: { ...updated, stats } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/forms/:id
adminRouter.delete("/forms/:id", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    await deleteForm(formId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Responses, Teams & Topics per Form
// ---------------------------------------------------------------------------

// GET /api/admin/forms/:id/responses
adminRouter.get("/forms/:id/responses", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    const form = await getFormById(formId);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
    }

    const [stats, responses, topics] = await Promise.all([
      getFormStats(form.id),
      getFormResponses(form.id),
      getFormTopics(form.id),
    ]);

    res.json({
      form,
      stats,
      responses,
      topics,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/teams/:id
adminRouter.delete("/teams/:id", requireAdmin, async (req, res, next) => {
  try {
    const teamId = z.string().min(1).parse(req.params.id);
    await deleteTeamById(teamId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/forms/:id/topics
adminRouter.get("/forms/:id/topics", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    const form = await getFormById(formId);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
    }
    const topics = await getFormTopics(formId);
    res.json({ topics });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/forms/:id/topics/upload
adminRouter.post(
  "/forms/:id/topics/upload",
  requireAdmin,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const formId = z.string().min(1).parse(req.params.id);
      let csvBuffer: Buffer | string | undefined = req.file?.buffer;
      if (!csvBuffer && typeof req.body?.csv === "string") {
        csvBuffer = req.body.csv;
      }

      if (!csvBuffer) {
        throw new AppError(400, "MISSING_FILE", "Please upload a CSV file with a 'topic' column.");
      }

      const topicNames = parseTopicsCsv(csvBuffer);
      const topics = await uploadFormTopics(formId, topicNames);
      const updatedForm = await getFormById(formId);

      res.json({
        ok: true,
        uploaded: topics.length,
        topics,
        form: updatedForm,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/admin/forms/:id/topics/:topicId
adminRouter.delete("/forms/:id/topics/:topicId", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    const topicId = z.string().min(1).parse(req.params.topicId);
    await deleteFormTopic(formId, topicId);
    const updatedForm = await getFormById(formId);
    res.json({ ok: true, form: updatedForm });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Exports (Excel & PDF)
// ---------------------------------------------------------------------------

// GET /api/admin/forms/:id/export/xlsx
adminRouter.get("/forms/:id/export/xlsx", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    const form = await getFormById(formId);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
    }

    const [stats, responses] = await Promise.all([
      getFormStats(form.id),
      getFormResponses(form.id),
    ]);

    const buffer = await generateFormExcelBuffer(form, stats, responses);
    const filename = `${form.slug}-responses.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/forms/:id/export/pdf
adminRouter.get("/forms/:id/export/pdf", requireAdmin, async (req, res, next) => {
  try {
    const formId = z.string().min(1).parse(req.params.id);
    const form = await getFormById(formId);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
    }

    const [stats, responses] = await Promise.all([
      getFormStats(form.id),
      getFormResponses(form.id),
    ]);

    const buffer = await generateFormPdfBuffer(form, stats, responses);
    const filename = `${form.slug}-responses.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Global Students CSV Upload
// ---------------------------------------------------------------------------

// GET /api/admin/students
adminRouter.get("/students", requireAdmin, async (_req, res, next) => {
  try {
    const [stats, students] = await Promise.all([getClassStats(), getAllStudents()]);
    res.json({ stats, students });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/students/upload
adminRouter.post(
  "/students/upload",
  requireAdmin,
  upload.single("file"),
  async (req, res, next) => {
    try {
      let csvBuffer: Buffer | string | undefined = req.file?.buffer;
      if (!csvBuffer && typeof req.body?.csv === "string") {
        csvBuffer = req.body.csv;
      }

      if (!csvBuffer) {
        throw new AppError(400, "MISSING_FILE", "Please upload a CSV file with columns roll_no,name,gender.");
      }

      const students = parseClassListCsv(csvBuffer);
      const stats = await upsertStudents(students);

      res.json({
        ok: true,
        uploaded: students.length,
        stats,
      });
    } catch (err) {
      next(err);
    }
  }
);
