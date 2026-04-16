/**
 * Shared anime card (poster-style, 3:4 aspect ratio).
 * Used by LibraryAnime, Search, and FutureReleases pages.
 */
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { getCoverUrl, FALLBACK_SVG, isBaha, getStatusStyle, getNextStatus, getReleaseFallback } from '../utils/anime'

export default function AnimeCard({ anime, onUpdated, adminOverride }) {
  const { isAdmin } = useAuth()
  const showAdmin = adminOverride !== undefined ? adminOverride : isAdmin
  const { showToast } = useToast()
  const navigate = useNavigate()

  const title = anime.anime_name_cn || anime.anime_name_en || anime.anime_name_alt || anime.anime_name_romanji || anime.anime_name_jp || 'Unknown Title'
  const imageUrl = getCoverUrl(anime.cover_image_file)
  const bahaFlag = isBaha(anime)
  const releaseFallback = getReleaseFallback(anime)

  const localFin = anime.ep_fin || 0
  const localTotal = anime.ep_total !== null && anime.ep_total !== undefined && anime.ep_total !== '' ? parseInt(anime.ep_total, 10) : '?'
  const cumFin = anime.cum_ep_fin ?? localFin
  const cumTotal = anime.cum_ep_total ?? localTotal

  const malText = anime.mal_rating
    ? <><i className="fas fa-star text-blue-500 mr-0.5"></i>{anime.mal_rating}</>
    : <><i className="fas fa-star text-gray-300 mr-0.5"></i>-</>

  const statusStyle = getStatusStyle(anime.watching_status)
  const nextStatus = getNextStatus(anime.watching_status || 'Might Watch')

  async function handleStatusToggle(e) {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/anime/${anime.system_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watching_status: nextStatus }),
        credentials: 'include',
      })
      if (res.ok) {
        const updated = await res.json()
        showToast('success', `Status → ${nextStatus}`)
        onUpdated?.(updated)
      } else {
        showToast('error', 'Update failed')
      }
    } catch {
      showToast('error', 'Network error')
    }
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      onClick={() => navigate(`/anime/${anime.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {anime.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>{anime.my_rating}
          </div>
        )}
        <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
          <i className="fas fa-tv mr-1 text-brand"></i>{anime.airing_type || 'TV'}
        </div>
        {bahaFlag && (
          <div className="absolute bottom-1 left-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-md shadow-md z-10 border border-white/50 flex items-center justify-center" title="Available on Bahamut">
            <img src="https://i2.bahamut.com.tw/anime/logo.svg" className="h-3 opacity-90" alt="Baha" />
          </div>
        )}
        <img
          src={imageUrl}
          alt="Cover"
          className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
          onError={e => { e.target.src = FALLBACK_SVG }}
        />
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1 relative z-20 bg-white">
        <h3 className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight mb-1.5" title={title}>{title}</h3>
        <div className="text-[10px] text-gray-500 font-medium mb-3 flex items-center justify-between">
          <span className="truncate pr-1">{releaseFallback}</span>
          <span className="shrink-0 flex items-center">{malText}</span>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="font-mono text-[11px] font-bold text-gray-700 tracking-tight">
            {cumFin} <span className="text-gray-400">/</span> {cumTotal} <span className="text-[9px] text-gray-400 font-sans tracking-normal ml-0.5">EP</span>
          </div>
          {showAdmin ? (
            <button
              onClick={handleStatusToggle}
              className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors ${statusStyle.cls}`}
              title={`${anime.watching_status || 'Might Watch'} → ${nextStatus}`}
            >
              <i className={`fas ${statusStyle.icon} text-[10px]`}></i>
            </button>
          ) : anime.watching_status ? (
            <div className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate" title={anime.watching_status}>
              {anime.watching_status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
