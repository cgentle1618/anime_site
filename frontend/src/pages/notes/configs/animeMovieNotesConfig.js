// Frontend: notes configuration file for animeMovieNotesConfig.
const SECTIONS = [
  { key: "remark", type: "remark" },
  { key: "advantages", label: "優點 Advantages", type: "string_list" },
  { key: "disadvantages", label: "缺點 Disadvantages", type: "string_list" },
  { key: "double_edged", label: "優缺點", type: "string_list" },
  { key: "public_reviews", label: "大眾評價 Public Reviews", type: "string_list" },
  { key: "personal_reviews", label: "我的評價 Personal Reviews", type: "string_list" },
  { key: "analysis", label: "解析 Analysis", type: "desc_links" },
  { key: "cinematography", label: "分鏡／演出／巧思", type: "desc_links" },
  { key: "foreshadowing", label: "Foreshadowing", type: "desc_links" },
  { key: "symmetry", label: "對稱 Symmetry", type: "desc_links" },
  { key: "adaptation", label: "改編 Adaptation", type: "desc_links", descRequired: true },
  { key: "resources", label: "Resources", type: "name_link" },
  { key: "unread", label: "Unread", type: "name_link" },
  { key: "questions", label: "Questions", type: "string_list" },
  { key: "quotes_memes", label: "名言／梗／迷因 Quotes & Memes", type: "quote" },
];

export default SECTIONS;

