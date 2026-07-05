// Frontend: info component file for ScoreBlock.
export default function ScoreBlock({
  malScore,
  malRank,
  anilistScore,
  updatedAt,
}) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="bg-blue-50 text-blue-800 border border-blue-100 px-4 py-2 rounded-lg flex items-center shadow-sm">
        <i className="fas fa-star text-blue-500 mr-2 text-lg"></i>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 leading-none mb-0.5">
            MAL Score
          </div>
          <div className="font-black text-base leading-none">
            {malScore || "-"}
          </div>
        </div>
      </div>
      <div className="bg-blue-50 text-blue-800 border border-blue-100 px-4 py-2 rounded-lg flex items-center shadow-sm">
        <i className="fas fa-trophy text-blue-500 mr-2 text-lg"></i>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 leading-none mb-0.5">
            MAL Rank
          </div>
          <div className="font-black text-base leading-none">
            {malRank ? `#${malRank}` : "-"}
          </div>
        </div>
      </div>
      <div className="bg-indigo-50 text-indigo-800 border border-indigo-100 px-4 py-2 rounded-lg flex items-center shadow-sm">
        <i className="fas fa-star-half-alt text-indigo-500 mr-2 text-lg"></i>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 leading-none mb-0.5">
            AniList Score
          </div>
          <div className="font-black text-base leading-none">
            {anilistScore || "-"}
          </div>
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          Last Updated
        </div>
        <div className="text-sm font-mono text-gray-600">
          {updatedAt ? new Date(updatedAt).toLocaleString() : "-"}
        </div>
      </div>
    </div>
  );
}

