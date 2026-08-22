// Frontend: notes configuration file for mangaNotesConfig.
const SECTIONS = [
  { key: "remark", type: "remark" },
  { key: "advantages", label: "優點 Advantages", type: "string_list" },
  { key: "disadvantages", label: "缺點 Disadvantages", type: "string_list" },
  { key: "double_edged", label: "優缺點", type: "string_list" },
  { key: "public_reviews", label: "大眾評價 Public Reviews", type: "string_list" },
  { key: "personal_reviews", label: "我的評價 Personal Reviews", type: "string_list" },
  {
    key: "highlight_episodes",
    label: "神回",
    type: "episode_type_desc",
    typeOptions: null,
    episodePlaceholder: "Chapter(s), e.g. ch 6",
  },
  { key: "analysis", label: "解析 Analysis", type: "desc_links" },
  { key: "cinematography", label: "分鏡/演出/巧思", type: "desc_links" },
  { key: "foreshadowing", label: "Foreshadowing", type: "desc_links" },
  { key: "symmetry", label: "對稱", type: "desc_links" },
  { key: "resources", label: "Resources", type: "name_link" },
  { key: "unread", label: "Unread", type: "name_link" },
  { key: "questions", label: "Questions", type: "string_list" },
  { key: "quotes", label: "名言 Quotes", type: "quote" },
  { key: "memes", label: "梗/迷因 Memes", type: "meme" },
];

export default SECTIONS;

