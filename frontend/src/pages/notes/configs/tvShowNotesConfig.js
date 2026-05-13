const SPECIAL_EPISODE_TYPES = [
  "加長",
  "變化OP",
  "變化ED",
  "無OP",
  "無ED",
  "特別OP",
  "特別ED",
  "回顧",
  "其他",
];

const SECTIONS = [
  { key: "remark", type: "remark" },
  { key: "advantages", label: "優點 Advantages", type: "string_list" },
  { key: "disadvantages", label: "缺點 Disadvantages", type: "string_list" },
  { key: "double_edged", label: "優缺點", type: "string_list" },
  { key: "public_reviews", label: "大眾評價 Public Reviews", type: "string_list" },
  { key: "personal_reviews", label: "我的評價 Personal Reviews", type: "string_list" },
  {
    key: "highlight_episodes",
    label: "神回/神片段",
    type: "episode_type_desc",
    typeOptions: null,
  },
  { key: "analysis", label: "解析 Analysis", type: "desc_links" },
  { key: "cinematography", label: "分鏡/演出/巧思", type: "desc_links" },
  { key: "foreshadowing", label: "Foreshadowing", type: "desc_links" },
  { key: "symmetry", label: "對稱", type: "desc_links" },
  {
    key: "special_episodes",
    label: "特殊變動 (加長/OP,ED)",
    type: "episode_type_desc",
    typeOptions: SPECIAL_EPISODE_TYPES,
  },
  { key: "adaptation", label: "改編", type: "desc_links" },
  { key: "resources", label: "Resources", type: "name_link" },
  { key: "unread", label: "Unread", type: "name_link" },
  { key: "questions", label: "Questions", type: "string_list" },
  { key: "quotes_memes", label: "名言/梗/迷因 Quotes & Memes", type: "quote_meme" },
];

export default SECTIONS;
