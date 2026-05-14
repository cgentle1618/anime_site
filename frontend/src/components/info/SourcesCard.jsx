export default function SourcesCard({
  showBaha,
  bahaLink,
  sourceNetflix,
  sourceOther,
  malLink,
  anilistLink,
  officialLink,
  twitterLink,
  imdbLink,
  officialSource,
  serializationPlatform,
}) {
  const hasAny =
    showBaha ||
    sourceNetflix ||
    officialSource ||
    serializationPlatform ||
    imdbLink ||
    (sourceOther && Object.keys(sourceOther).length > 0) ||
    malLink ||
    anilistLink ||
    officialLink ||
    twitterLink;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
        <i className="fas fa-link mr-1.5"></i>Sources
      </h3>
      <div className="space-y-2">
        {showBaha && bahaLink && (
          <a
            href={bahaLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full bg-blue-50 hover:bg-[#00B4D8] text-blue-800 hover:text-white px-3 py-2 rounded border border-blue-100 transition text-sm font-bold"
          >
            <span className="flex items-center">
              <img
                src="https://i2.bahamut.com.tw/anime/logo.svg"
                className="h-4 mr-2 opacity-80"
                alt="Baha"
              />{" "}
              Bahamut
            </span>
            <i className="fas fa-external-link-alt text-[10px]"></i>
          </a>
        )}
        {showBaha && !bahaLink && (
          <div className="flex items-center w-full bg-gray-50 text-gray-500 px-3 py-2 rounded border border-gray-200 text-sm font-bold">
            <img
              src="https://i2.bahamut.com.tw/anime/logo.svg"
              className="h-4 mr-2 grayscale opacity-50"
              alt="Baha"
            />{" "}
            Bahamut (No Link)
          </div>
        )}
        {sourceNetflix && (
          <div className="flex items-center w-full bg-red-50 text-red-800 px-3 py-2 rounded border border-red-100 text-sm font-bold">
            <span className="text-[#E50914] font-black mr-2">N</span> Netflix
          </div>
        )}
        {officialSource && (
          <div className="flex items-center w-full bg-gray-50 text-gray-700 px-3 py-2 rounded border border-gray-200 text-sm font-bold">
            <i className="fas fa-tv mr-2 text-gray-400"></i>
            {officialSource}
          </div>
        )}
        {serializationPlatform && (
          <div className="flex items-center w-full bg-gray-50 text-gray-700 px-3 py-2 rounded border border-gray-200 text-sm font-bold">
            <i className="fas fa-book mr-2 text-gray-400"></i>
            {serializationPlatform}
          </div>
        )}
        {imdbLink && (
          <a
            href={imdbLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full bg-yellow-50 hover:bg-yellow-400 text-yellow-800 hover:text-yellow-900 px-3 py-2 rounded border border-yellow-100 transition text-sm font-bold"
          >
            <span className="flex items-center">
              <span className="bg-yellow-400 text-yellow-900 text-[9px] px-1 py-0.5 rounded mr-2 font-black">
                IMDb
              </span>
              IMDb Page
            </span>
            <i className="fas fa-external-link-alt text-[10px]"></i>
          </a>
        )}
        {sourceOther &&
          Object.entries(sourceOther).map(([name, url]) =>
            url ? (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between w-full bg-purple-50 hover:bg-purple-600 text-purple-800 hover:text-white px-3 py-2 rounded border border-purple-100 transition text-sm font-bold"
              >
                <span>
                  <i className="fas fa-play-circle mr-2"></i>
                  {name}
                </span>
                <i className="fas fa-external-link-alt text-[10px]"></i>
              </a>
            ) : (
              <div
                key={name}
                className="flex items-center w-full bg-gray-50 text-gray-500 px-3 py-2 rounded border border-gray-200 text-sm font-bold"
              >
                <i className="fas fa-play-circle mr-2 opacity-50"></i>
                {name}
              </div>
            ),
          )}
        {malLink && (
          <a
            href={malLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full text-gray-600 hover:text-brand px-3 py-2 text-sm font-bold border-b border-gray-50"
          >
            <span className="flex items-center">
              <span className="bg-[#2E51A2] text-white text-[9px] px-1 py-0.5 rounded mr-2">
                MAL
              </span>{" "}
              MyAnimeList
            </span>
            <i className="fas fa-external-link-alt text-[10px]"></i>
          </a>
        )}
        {anilistLink && (
          <a
            href={anilistLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full text-gray-600 hover:text-brand px-3 py-2 text-sm font-bold border-b border-gray-50"
          >
            <span className="flex items-center">
              <span className="bg-[#02A9FF] text-white text-[9px] px-1 py-0.5 rounded mr-2">
                AL
              </span>{" "}
              AniList
            </span>
            <i className="fas fa-external-link-alt text-[10px]"></i>
          </a>
        )}
        {officialLink && (
          <a
            href={officialLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full text-gray-600 hover:text-brand px-3 py-2 text-sm font-bold border-b border-gray-50"
          >
            <span className="flex items-center">
              <i className="fas fa-globe mr-2"></i> Official Site
            </span>
            <i className="fas fa-external-link-alt text-[10px]"></i>
          </a>
        )}
        {twitterLink && (
          <a
            href={twitterLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full text-gray-600 hover:text-brand px-3 py-2 text-sm font-bold"
          >
            <span className="flex items-center">
              <i className="fab fa-twitter mr-2 text-[#1DA1F2]"></i> Twitter
            </span>
            <i className="fas fa-external-link-alt text-[10px]"></i>
          </a>
        )}
        {!hasAny && (
          <div className="text-sm text-gray-400 italic">
            No sources recorded.
          </div>
        )}
      </div>
    </div>
  );
}
