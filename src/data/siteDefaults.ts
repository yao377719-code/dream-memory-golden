export const customerMode = import.meta.env.PUBLIC_CUSTOMER_MODE;
export const isBlankCustomerMode = customerMode === "blank";

// Framework-only defaults. Customer content must come from that customer's KV.
export const profile = {
  roleName: "NAME ❤ NAME",
  showGoodsWall: true,
  intro: "在这里写下你们的简介。",
  nickname: "我的专属小站",
  showAbout: true,
  showStory: true,
  showMusic: true,
  showAnniversaryList: true,
  showQuotes: true,
  showAdminEntry: true,
  timelineTitle: "我们的故事",
  cover: "/uploads/memory-placeholder.svg",
  avatar: "/uploads/avatar-placeholder.svg",
  themeColor: "gold",
  customThemeColor: "",
  layoutPreset: "full",
  showCalendar: true,
  quoteButtonText: "换一句",
  quoteTitle: "想对你说：",
  quoteFallback: "这里会随机出现一句想说的话。",
  musicModuleTitle: "音乐",
  musicTitle: "写给你的一首歌",
  musicArtist: "可以在后台填写音乐链接",
  musicUrl: "",
  musicCover: "",
};

export const about = {
  storyTitle: "关于我们",
  personAAvatar: "/uploads/avatar-placeholder.svg",
  personBAvatar: "/uploads/avatar-placeholder.svg",
  personAAvatarPosition: "center",
  personBAvatarPosition: "center",
  personAName: "我",
  storyIntro: "写下你们相遇、相爱或陪伴至今的一句话。",
  personBName: "他",
  personBBio: "在这里写下对方的介绍。",
  personABio: "在这里写下自己的介绍。",
};

export const modules = {
  aboutTitle: "关于我们",
  storyTitle: "我们的故事",
  galleryTitle: "周边与相册",
  albumPageTitle: "相册与周边",
  anniversaryTitle: "纪念日",
  calendarTitle: "小日历",
  quoteTitle: "想对你说：",
  adminTitle: "管理入口",
};

// Empty product structure, not seeded customer content or demo media.
export const defaultGalleryCategories = [
  { key: "daily", title: "日常", order: 1, cover: "", coverPosition: "center" },
  { key: "together", title: "合照", order: 2, cover: "", coverPosition: "center" },
  { key: "goods", title: "谷子", order: 3, cover: "", coverPosition: "center" },
  { key: "artwork", title: "稿件", order: 4, cover: "", coverPosition: "center" },
];

export const navigation = {
  items: [
    { label: "主页", href: "/", order: 1, visible: true },
    { label: modules.aboutTitle, href: "/#about", order: 2, visible: true },
    { label: modules.storyTitle, href: "/#story", order: 3, visible: true },
    { label: modules.galleryTitle, href: "/#gallery", order: 4, visible: true },
    { label: modules.adminTitle, href: "/admin/", order: 99, visible: true },
  ],
};
