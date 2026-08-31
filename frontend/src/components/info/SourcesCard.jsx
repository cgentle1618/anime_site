// Frontend: info component file for SourcesCard.
//
// A slip of hairline rows: the site name on the left, an external-link mark
// on the right. Rows are ink; a brand tint appears only on hover. No
// per-site brand colours - the name says which site it is.
import { Slip } from "../ui/primitives";

const ROW_CLS =
  "flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-sm";
const LINK_CLS = `${ROW_CLS} text-text hover:text-brand hover:bg-brand-soft transition`;
const PLAIN_CLS = `${ROW_CLS} text-text-muted`;

function Tag({ children }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.12em] border border-border-strong text-text-muted px-1 py-0.5 leading-none shrink-0">
      {children}
    </span>
  );
}

function SourceLink({ href, tag, children, title }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLS}
      title={title}
    >
      <span className="flex items-center gap-2 min-w-0">
        {tag && <Tag>{tag}</Tag>}
        <span className="truncate">{children}</span>
      </span>
      <i
        className="fas fa-external-link-alt text-[10px] text-text-faint shrink-0"
        aria-hidden="true"
      ></i>
    </a>
  );
}

function SourceRow({ tag, children, muted = false }) {
  return (
    <div className={`${PLAIN_CLS} ${muted ? "text-text-faint" : ""}`}>
      <span className="flex items-center gap-2 min-w-0">
        {tag && <Tag>{tag}</Tag>}
        <span className="truncate">{children}</span>
      </span>
    </div>
  );
}

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
    <Slip title="Sources" padded={false}>
      {showBaha && bahaLink && (
        <SourceLink href={bahaLink} title="Watch on Bahamut">
          <span className="flex items-center gap-2">
            <img
              src="https://i2.bahamut.com.tw/anime/logo.svg"
              className="h-3.5 opacity-80"
              alt=""
            />
            Bahamut
          </span>
        </SourceLink>
      )}
      {showBaha && !bahaLink && (
        <SourceRow muted>
          <span className="flex items-center gap-2">
            <img
              src="https://i2.bahamut.com.tw/anime/logo.svg"
              className="h-3.5 grayscale opacity-50"
              alt=""
            />
            Bahamut (no link)
          </span>
        </SourceRow>
      )}
      {sourceNetflix && <SourceRow tag="N">Netflix</SourceRow>}
      {officialSource && <SourceRow>{officialSource}</SourceRow>}
      {serializationPlatform && <SourceRow>{serializationPlatform}</SourceRow>}
      {imdbLink && (
        <SourceLink href={imdbLink} tag="IMDb">
          IMDb page
        </SourceLink>
      )}
      {sourceOther &&
        Object.entries(sourceOther).map(([name, url]) =>
          url ? (
            <SourceLink key={name} href={url}>
              {name}
            </SourceLink>
          ) : (
            <SourceRow key={name} muted>
              {name}
            </SourceRow>
          ),
        )}
      {malLink && (
        <SourceLink href={malLink} tag="MAL">
          MyAnimeList
        </SourceLink>
      )}
      {anilistLink && (
        <SourceLink href={anilistLink} tag="AL">
          AniList
        </SourceLink>
      )}
      {officialLink && <SourceLink href={officialLink}>Official site</SourceLink>}
      {twitterLink && <SourceLink href={twitterLink}>Twitter</SourceLink>}
      {!hasAny && (
        <div className="px-4 py-3 text-sm text-text-faint">
          No sources recorded.
        </div>
      )}
    </Slip>
  );
}
