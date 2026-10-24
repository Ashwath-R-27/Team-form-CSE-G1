import { Router } from "express";
import { z } from "zod";
import {
  checkRollForForm,
  checkTopicForForm,
  getChosenTopicsBySlug,
  getFormBySlug,
  getFormStats,
  getFormTopics,
  listForms,
  submitTeamAtomic,
} from "../db/repository";
import { AppError } from "../middleware/errorHandler";

export const publicRouter = Router();

const slugParamSchema = z.object({
  slug: z.string().trim().min(1, "Form slug is required"),
});

const checkRollParamSchema = z.object({
  slug: z.string().trim().min(1, "Form slug is required"),
  roll: z.string().trim().min(1, "Roll number is required"),
});

const submitBodySchema = z.object({
  rolls: z
    .array(z.string().trim().min(1, "Roll number cannot be empty"))
    .min(1, "At least one roll number is required")
    .max(20, "Maximum team size is 20"),
  topic: z.string().optional().nullable(),
});

// GET /api/forms — list public forms
publicRouter.get("/forms", async (_req, res, next) => {
  try {
    const forms = await listForms();
    const enriched = await Promise.all(
      forms.map(async (f) => {
        const stats = await getFormStats(f.id);
        return { ...f, stats };
      })
    );
    res.json({ forms: enriched });
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:slug -> title, description, min/max team size, collect_topic, allow_topic_repeat, is_open, hasTopicOptions
publicRouter.get("/forms/:slug", async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", `Form "${slug}" was not found.`);
    }
    const stats = await getFormStats(form.id);
    res.json({
      id: form.id,
      slug: form.slug,
      title: form.title,
      description: form.description,
      min_team_size: form.min_team_size,
      max_team_size: form.max_team_size,
      collect_topic: form.collect_topic,
      allow_topic_repeat: form.allow_topic_repeat,
      show_chosen_topics: form.show_chosen_topics,
      is_open: form.is_open,
      hasTopicOptions: form.hasTopicOptions,
      topicsCount: form.topicsCount,
      created_at: form.created_at,
      stats,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:slug/stats -> { boys, girls, total, teams }
publicRouter.get("/forms/:slug/stats", async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", `Form "${slug}" was not found.`);
    }
    const stats = await getFormStats(form.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:slug/check-roll/:roll -> { status: "available" | "taken" | "not_found", name?, gender?, teamNo? }
publicRouter.get("/forms/:slug/check-roll/:roll", async (req, res, next) => {
  try {
    const { slug, roll } = checkRollParamSchema.parse(req.params);
    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", `Form "${slug}" was not found.`);
    }

    const normalizedRoll = roll.trim().toUpperCase();
    const result = await checkRollForForm(form.id, normalizedRoll);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:slug/topics -> options with { id, name, taken, teamNo? } (taken only matters when repeat is off)
publicRouter.get("/forms/:slug/topics", async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", `Form "${slug}" was not found.`);
    }

    const topics = await getFormTopics(form.id, {
      respectAllowRepeat: true,
      allowTopicRepeat: form.allow_topic_repeat,
    });
    res.json({ topics });
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:slug/chosen-topics -> [{ topic, teamNos: number[], count }]
publicRouter.get("/forms/:slug/chosen-topics", async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const chosenTopics = await getChosenTopicsBySlug(slug);
    res.setHeader("Cache-Control", "no-cache");
    res.json(chosenTopics);
  } catch (err) {
    next(err);
  }
});

// GET /api/forms/:slug/check-topic?topic=... -> { status: "available" | "taken", teamNo? }
publicRouter.get("/forms/:slug/check-topic", async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const rawTopic = typeof req.query.topic === "string" ? req.query.topic : "";
    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", `Form "${slug}" was not found.`);
    }

    const result = await checkTopicForForm(form.id, rawTopic);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/forms/:slug/submit body { rolls: string[], topic?: string } -> { teamNo, topic, members (sorted) }
publicRouter.post("/forms/:slug/submit", async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const { rolls, topic } = submitBodySchema.parse(req.body);

    const form = await getFormBySlug(slug);
    if (!form) {
      throw new AppError(404, "FORM_NOT_FOUND", `Form "${slug}" was not found.`);
    }

    const result = await submitTeamAtomic(form.id, rolls, topic);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
