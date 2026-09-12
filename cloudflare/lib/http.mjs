export function json(body, status = 200, cacheControl = "no-store") {
  return Response.json(body, {
    status,
    headers: { "cache-control": cacheControl, "x-content-type-options": "nosniff" },
  });
}

export function getCustomerId(env) {
  const customerId = String(env.CUSTOMER_ID || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!customerId) throw new Error("CUSTOMER_ID is required");
  return customerId;
}

export function assertRuntimeIdentity(request, env, { requireStore = false } = {}) {
  const customerId = getCustomerId(env);
  const projectName = String(env.PAGES_PROJECT_NAME || "").trim();
  if (!/^dream-memory-[a-z0-9-]+$/.test(projectName)) throw new Error("PAGES_PROJECT_NAME is required");
  if (requireStore && (!env.DREAM_MEMORY_STORE || typeof env.DREAM_MEMORY_STORE !== "object")) {
    throw new Error("DREAM_MEMORY_STORE binding is required");
  }
  const hostname = new URL(request.url).hostname.toLowerCase();
  const fixedHostname = `${projectName}.pages.dev`;
  if (hostname.endsWith(".pages.dev") && hostname !== fixedHostname && !hostname.endsWith(`.${fixedHostname}`)) {
    throw new Error("Request hostname does not match PAGES_PROJECT_NAME");
  }
  return { customerId, projectName };
}

export function isAuthorized(request, env) {
  const expected = String(env.ADMIN_PASSWORD || "");
  return expected.length > 0 && request.headers.get("x-admin-password") === expected;
}

export function toCloudflareImageUrls(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toCloudflareImageUrls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toCloudflareImageUrls(item)]));
  }
  return value;
}

export function normalizeGalleryDraft(value) {
  const source = typeof value === "string"
    ? { images: value }
    : value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  const candidates = [];
  const appendCandidate = (item) => {
    if (typeof item === "string" && item.trim()) {
      candidates.push({ image: item.trim() });
      return;
    }
    if (item && typeof item === "object" && !Array.isArray(item) && typeof item.image === "string" && item.image.trim()) {
      candidates.push({ ...item, image: item.image.trim() });
    }
  };

  if (Array.isArray(source.images)) source.images.forEach(appendCandidate);
  else appendCandidate(source.images);
  if (Array.isArray(source.items)) source.items.forEach(appendCandidate);
  else appendCandidate(source.items);
  if (!candidates.some((item) => item.image === source.image)) appendCandidate(source.image);

  return { ...source, images: candidates };
}

export function sanitizeStoredData(value, customerId) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  delete data.password;
  delete data.adminPassword;
  if (data.profile && typeof data.profile === "object" && !Array.isArray(data.profile)) {
    const profile = { ...data.profile };
    const customThemeColor = String(profile.customThemeColor || "").trim().replace(/^#/, "").toUpperCase();
    profile.customThemeColor = /^[0-9A-F]{6}$/.test(customThemeColor) ? `#${customThemeColor}` : "";
    profile.layoutPreset = ["full", "compact", "none"].includes(profile.layoutPreset) ? profile.layoutPreset : "full";
    data.profile = profile;
  }
  data.galleryDraft = normalizeGalleryDraft(data.galleryDraft);
  return { ...data, customerId };
}
