const BUCKET_NAME = 'cg1618-anime-covers'
const FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`

export { FALLBACK_SVG }

export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === 'N/A') return FALLBACK_SVG
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return isLocal
    ? `/static/covers/${coverFile}`
    : `https://storage.googleapis.com/${BUCKET_NAME}/${coverFile}`
}

export function getDisplayName(item, type) {
  if (!item) return ''
  if (type === 'series') {
    return item.series_name_cn || item.series_name_en || item.series_name_alt || 'Unknown Series'
  }
  return (
    item[`${type}_name_cn`] ||
    item[`${type}_name_en`] ||
    item[`${type}_name_alt`] ||
    item[`${type}_name_romanji`] ||
    item[`${type}_name_jp`] ||
    'Unknown Title'
  )
}

export function getSortName(item, type) {
  if (!item) return ''
  if (type === 'series') {
    return item.series_name_en || item.series_name_cn || item.series_name_alt || ''
  }
  return (
    item[`${type}_name_en`] ||
    item[`${type}_name_romanji`] ||
    item[`${type}_name_cn`] ||
    item[`${type}_name_alt`] ||
    item[`${type}_name_jp`] ||
    ''
  )
}

export function isBaha(anime) {
  return anime.source_baha === true || String(anime.source_baha).toLowerCase() === 'true'
}

// Watching status cycle: same order as base.js
const STATUS_CYCLE = [
  'Might Watch',
  'Plan to Watch',
  'Watch When Airs',
  'Active Watching',
  'Passive Watching',
  'Paused',
  'Completed',
  'Temp Dropped',
  "Won't Watch",
  'Dropped',
]

const STATUS_STYLES = {
  'Active Watching':  { cls: 'bg-green-50 text-green-600 border-green-200',  icon: 'fa-play' },
  'Passive Watching': { cls: 'bg-teal-50 text-teal-600 border-teal-200',     icon: 'fa-headphones' },
  'Paused':           { cls: 'bg-yellow-50 text-yellow-600 border-yellow-200', icon: 'fa-pause' },
  'Completed':        { cls: 'bg-blue-50 text-blue-600 border-blue-200',      icon: 'fa-check' },
  'Plan to Watch':    { cls: 'bg-purple-50 text-purple-600 border-purple-200', icon: 'fa-bookmark' },
  'Watch When Airs':  { cls: 'bg-orange-50 text-orange-600 border-orange-200', icon: 'fa-clock' },
  'Temp Dropped':     { cls: 'bg-red-50 text-red-400 border-red-200',         icon: 'fa-pause-circle' },
  'Dropped':          { cls: 'bg-red-50 text-red-600 border-red-200',         icon: 'fa-times-circle' },
  "Won't Watch":      { cls: 'bg-gray-50 text-gray-400 border-gray-200',      icon: 'fa-ban' },
  'Might Watch':      { cls: 'bg-gray-50 text-gray-400 border-gray-200',      icon: 'fa-question' },
}

export function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES['Might Watch']
}

export function getNextStatus(current) {
  const idx = STATUS_CYCLE.indexOf(current)
  if (idx === -1) return 'Might Watch'
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
}

export function getReleaseFallback(anime) {
  if (anime.release_season && anime.release_year) return `${anime.release_season} ${anime.release_year}`
  if (anime.release_month && anime.release_year) return `${anime.release_month} ${anime.release_year}`
  if (anime.release_year) return String(anime.release_year)
  return 'TBA'
}

const RATING_WEIGHT = { S: 0, 'A+': 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 }
export function getRatingWeight(rating) {
  return RATING_WEIGHT[rating] !== undefined ? RATING_WEIGHT[rating] : 99
}
