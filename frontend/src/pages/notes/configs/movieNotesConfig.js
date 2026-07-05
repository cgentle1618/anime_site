// Frontend: notes configuration file for movieNotesConfig.
const SECTIONS = [
  { key: "remark", label: "Remark", type: "remark" },
  { key: "advantages", label: "優點 Advantages", type: "string_list" },
  { key: "disadvantages", label: "缺點 Disadvantages", type: "string_list" },
  { key: "double_edged", label: "優缺點", type: "string_list" },
  { key: "public_reviews", label: "大眾評價 Public Reviews", type: "string_list" },
  { key: "personal_reviews", label: "我的評價 Personal Reviews", type: "string_list" },
  { key: "analysis", label: "解析 Analysis", type: "desc_links" },
  { key: "resources", label: "Resources", type: "name_link" },
  { key: "unread", label: "Unread", type: "name_link" },
  { key: "questions", label: "Questions", type: "string_list" },
  { key: "quotes_memes", label: "名言／梗／迷因 Quotes & Memes", type: "quote_meme" },
];

export default SECTIONS;

