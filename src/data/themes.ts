export const themeOptions = [
  ["green", "薄荷绿", "#4c8a76"],
  ["rose", "玫瑰粉", "#d85a7f"],
  ["blue", "晴空蓝", "#4f78b8"],
  ["gold", "暖金色", "#b98231"],
  ["lavender", "薰衣草紫", "#8165b1"],
  ["peach", "蜜桃橙", "#df7d62"],
  ["berry", "莓果紫", "#a85d95"],
  ["cream", "奶油金", "#b78b3d"],
  ["wine", "酒红生日色", "#9f3f56"],
  ["vermilion", "朱砂应援色", "#d65a4a"],
  ["amber", "琥珀橙", "#c47a22"],
  ["lemon", "柠檬金", "#a78d13"],
  ["emerald", "翡翠绿", "#2e8b68"],
  ["aqua", "湖水青", "#258c91"],
  ["royal", "皇家蓝", "#405fb5"],
  ["night", "星夜紫", "#644d9b"],
] as const;

type ThemeKey = (typeof themeOptions)[number][0];
type Theme = { accent: string; soft: string; hover: string; strong: string; shadow: string; bg: string; bgSoft: string; paper: string; line: string };

export const themeMap: Record<ThemeKey, Theme> = {
  green: { accent: "#4c8a76", soft: "#dceee8", hover: "#e8f6f1", strong: "#28715c", shadow: "rgba(76,138,118,.22)", bg: "#f1f6f3", bgSoft: "#e8f3ef", paper: "#fbfffd", line: "#dbe9e3" },
  rose: { accent: "#d85a7f", soft: "#f8dce6", hover: "#fff0f5", strong: "#bd3e65", shadow: "rgba(216,90,127,.24)", bg: "#f8f1f4", bgSoft: "#f3e8ee", paper: "#fffafc", line: "#eadce3" },
  blue: { accent: "#4f78b8", soft: "#dce9f8", hover: "#eef5ff", strong: "#345f9d", shadow: "rgba(79,120,184,.22)", bg: "#f0f4fa", bgSoft: "#e6eef8", paper: "#fbfdff", line: "#dce6f2" },
  gold: { accent: "#b98231", soft: "#f4e3c8", hover: "#fff7e8", strong: "#8f641f", shadow: "rgba(185,130,49,.22)", bg: "#f8f3e8", bgSoft: "#f1e5cd", paper: "#fffaf0", line: "#eadbbf" },
  lavender: { accent: "#8165b1", soft: "#e8e0f6", hover: "#f6f1ff", strong: "#694aa0", shadow: "rgba(129,101,177,.24)", bg: "#f5f1f7", bgSoft: "#ebe4f0", paper: "#fffafc", line: "#e2d9e8" },
  peach: { accent: "#df7d62", soft: "#f9dfd1", hover: "#fff2eb", strong: "#bd6048", shadow: "rgba(223,125,98,.22)", bg: "#f9f1ec", bgSoft: "#f2e2d9", paper: "#fffaf6", line: "#eddcd3" },
  berry: { accent: "#a85d95", soft: "#ead7ee", hover: "#fbf0ff", strong: "#884476", shadow: "rgba(168,93,149,.22)", bg: "#f6f0f6", bgSoft: "#ecdfee", paper: "#fffafd", line: "#e5d7e6" },
  cream: { accent: "#b78b3d", soft: "#fff3d8", hover: "#fffaf0", strong: "#8f6928", shadow: "rgba(183,139,61,.2)", bg: "#f8f4ea", bgSoft: "#eee3cc", paper: "#fffaf0", line: "#e7dac1" },
  wine: { accent: "#9f3f56", soft: "#f2dce2", hover: "#fbf0f3", strong: "#7d2d42", shadow: "rgba(159,63,86,.23)", bg: "#f7f0f2", bgSoft: "#eee1e5", paper: "#fffafb", line: "#e6d7dc" },
  vermilion: { accent: "#d65a4a", soft: "#f7ddd8", hover: "#fff1ee", strong: "#aa3e32", shadow: "rgba(214,90,74,.23)", bg: "#f9f1ef", bgSoft: "#f1e2de", paper: "#fffaf8", line: "#ead9d5" },
  amber: { accent: "#c47a22", soft: "#f6e4cd", hover: "#fff6e9", strong: "#965817", shadow: "rgba(196,122,34,.22)", bg: "#f8f3ea", bgSoft: "#efe4d2", paper: "#fffaf2", line: "#e8dcc8" },
  lemon: { accent: "#a78d13", soft: "#f3edc9", hover: "#fffbea", strong: "#776407", shadow: "rgba(167,141,19,.21)", bg: "#f8f6eb", bgSoft: "#ece8d2", paper: "#fffdf4", line: "#e5e0c6" },
  emerald: { accent: "#2e8b68", soft: "#d7eee5", hover: "#eaf8f2", strong: "#176849", shadow: "rgba(46,139,104,.22)", bg: "#eff7f4", bgSoft: "#e1f0ea", paper: "#fafffd", line: "#d4e8e0" },
  aqua: { accent: "#258c91", soft: "#d6eef0", hover: "#eaf9fa", strong: "#11686d", shadow: "rgba(37,140,145,.22)", bg: "#eff7f7", bgSoft: "#e0eff0", paper: "#faffff", line: "#d3e7e8" },
  royal: { accent: "#405fb5", soft: "#dce3f7", hover: "#eff3ff", strong: "#29458f", shadow: "rgba(64,95,181,.23)", bg: "#f0f3fa", bgSoft: "#e4e9f6", paper: "#fbfcff", line: "#d9e0f0" },
  night: { accent: "#644d9b", soft: "#e3def2", hover: "#f4f1fc", strong: "#493479", shadow: "rgba(100,77,155,.23)", bg: "#f3f1f7", bgSoft: "#e9e4f1", paper: "#fdfbff", line: "#ded8e8" },
};

export function getTheme(key?: string) {
  return themeMap[key as ThemeKey] ?? themeMap.green;
}
