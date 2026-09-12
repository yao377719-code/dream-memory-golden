import { defineCollection, z } from "astro:content";

const imagePosition = z.enum(["center", "top", "bottom", "left", "right"]).default("center");

const positionedImage = z.object({
  image: z.string(),
  imagePosition: imagePosition.optional().default("center"),
  title: z.string().optional(),
  caption: z.string().optional(),
  source: z.string().optional(),
});

const timeline = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    images: z.array(z.union([z.string(), positionedImage])).default([]),
    mood: z.string().optional(),
    summary: z.string().optional(),
  }),
});

const quotes = defineCollection({
  type: "data",
  schema: z.object({
    content: z.string(),
    mood: z.string().optional(),
  }),
});

const albums = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date().optional(),
    image: z.string().optional(),
    imagePosition: imagePosition.optional().default("center"),
    images: z
      .union([z.array(z.string()), z.string()])
      .default([])
      .transform((value) => (Array.isArray(value) ? value : value ? [value] : [])),
    items: z.array(positionedImage).default([]),
    caption: z.string().optional(),
    category: z.string().default("daily"),
    source: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

const galleryCategories = defineCollection({
  type: "data",
  schema: z.object({
    key: z.string(),
    title: z.string(),
    cover: z.string().optional(),
    coverPosition: imagePosition.optional().default("center"),
    order: z.number().default(0),
  }),
});

const anniversaries = defineCollection({
  type: "data",
  schema: z.object({
    name: z.string().optional(),
    title: z.string().optional(),
    date: z.coerce.date(),
    kind: z.enum(["since", "countdown"]).default("since"),
    color: z.enum(["rose", "green", "gold", "blue"]).default("rose"),
    calendarColor: z.enum(["rose", "green", "gold", "blue", "lavender", "peach", "berry", "cream"]).default("rose"),
    showOnCalendar: z.boolean().default(false),
    calendarText: z.string().optional(),
    colors: z.array(z.enum(["rose", "green", "gold", "blue", "lavender", "peach"])).default([]),
    note: z.string().optional(),
  }),
});

export const collections = { timeline, quotes, albums, galleryCategories, anniversaries };
