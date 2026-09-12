(function setupDreamTheme(global) {
  const DARK_TEXT = "#27222A";
  const MUTED_TEXT = "#675F68";

  function normalizeHex(value) {
    const normalized = String(value || "").trim().replace(/^#/, "").toUpperCase();
    return /^[0-9A-F]{6}$/.test(normalized) ? `#${normalized}` : "";
  }

  function toRgb(value) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    };
  }

  function toHex({ r, g, b }) {
    return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }

  function mix(source, target, targetWeight) {
    const left = toRgb(source);
    const right = toRgb(target);
    if (!left || !right) return "";
    const weight = Math.min(1, Math.max(0, Number(targetWeight) || 0));
    return toHex({
      r: left.r * (1 - weight) + right.r * weight,
      g: left.g * (1 - weight) + right.g * weight,
      b: left.b * (1 - weight) + right.b * weight,
    });
  }

  function luminance(value) {
    const rgb = toRgb(value);
    if (!rgb) return 0;
    const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrast(left, right) {
    const first = luminance(left);
    const second = luminance(right);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function readableText(background) {
    return contrast(background, DARK_TEXT) >= contrast(background, "#FFFFFF") ? DARK_TEXT : "#FFFFFF";
  }

  function deriveTheme(value) {
    const accent = normalizeHex(value);
    if (!accent) return null;
    const rgb = toRgb(accent);
    return {
      accent,
      soft: mix(accent, "#FFFFFF", 0.78),
      hover: mix(accent, "#FFFFFF", 0.9),
      strong: mix(accent, "#000000", luminance(accent) > 0.42 ? 0.34 : 0.18),
      shadow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`,
      bg: mix(accent, "#FFFFFF", 0.94),
      bgSoft: mix(accent, "#FFFFFF", 0.87),
      paper: mix(accent, "#FFFFFF", 0.975),
      line: mix(accent, "#FFFFFF", 0.76),
      ink: DARK_TEXT,
      muted: MUTED_TEXT,
      buttonText: readableText(accent),
    };
  }

  function withReadableText(theme) {
    if (!theme?.accent) return null;
    return {
      ...theme,
      ink: theme.ink || DARK_TEXT,
      muted: theme.muted || MUTED_TEXT,
      buttonText: theme.buttonText || readableText(theme.accent),
    };
  }

  function resolveTheme(profile, presets) {
    return deriveTheme(profile?.customThemeColor) || withReadableText(presets?.[profile?.themeColor]);
  }

  function applyThemeVars(theme, roots) {
    const resolved = withReadableText(theme);
    if (!resolved) return;
    const variables = {
      "--accent": resolved.accent,
      "--accent-soft": resolved.soft,
      "--accent-hover": resolved.hover,
      "--accent-strong": resolved.strong,
      "--accent-shadow": resolved.shadow,
      "--site-bg": resolved.bg,
      "--site-bg-soft": resolved.bgSoft,
      "--paper": resolved.paper,
      "--line": resolved.line,
      "--ink": resolved.ink,
      "--muted": resolved.muted,
      "--button-text": resolved.buttonText,
    };
    for (const root of roots || []) {
      if (!root) continue;
      for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    }
  }

  global.DreamTheme = { normalizeHex, deriveTheme, resolveTheme, applyThemeVars, contrast };
})(window);
