const imageName = /^\d{13}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|webp|jpg)$/i;

export function ownsImageKey(key, customerId) {
  return typeof key === "string" && key.startsWith(customerId + "/") &&
    imageName.test(key.slice(customerId.length + 1));
}

export function imageReferences(value, customerId, projectName) {
  const references = new Set();
  const remaining = [value];
  const host = projectName + ".pages.dev";
  while (remaining.length) {
    const entry = remaining.pop();
    if (entry && typeof entry === "object") {
      for (const child of Object.values(entry)) remaining.push(child);
      continue;
    }
    if (typeof entry !== "string") continue;
    for (const match of entry.matchAll(/(?:https?:\/\/[^\s"'<>()[\]]+)?\/api\/site-image\?id=[^\s"'<>()[\]&#]+/gi)) {
      try {
        const url = new URL(match[0], "https://" + host);
        const key = url.searchParams.get("id");
        if (url.hostname === host && url.pathname === "/api/site-image" && ownsImageKey(key, customerId)) references.add(key);
      } catch { /* a non-image string */ }
    }
  }
  return references;
}

export function lifecycleStub(env, customerId) {
  const binding = env.DREAM_MEMORY_IMAGE_LIFECYCLE;
  return binding?.get(binding.idFromName(customerId));
}

export function lifecycleRequest(stub, pathname, customerId, options = {}) {
  return stub.fetch("https://images.internal" + pathname, {
    ...options, headers: { ...options.headers, "x-site-id": customerId },
  });
}
