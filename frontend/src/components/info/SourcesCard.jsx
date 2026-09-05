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

// Media types whose sources are things you read rather than watch.
const READING_TYPES = new Set(["manga", "novel", "comic"]);

function accessHeading(mediaType) {
  return READING_TYPES.has(mediaType) ? "Where to Read" : "Where to Watch";
}

// A single `sources` row. `available` is a tristate:
//  - true + url     -> a real link
//  - true + no url  -> a plain row (known available, nothing to link to yet)
//  - false          -> a muted row marked "not available" (a known absence
//                      is information, not something to hide)
//  - null/undefined -> a muted row with no claim either way
function SourceEntry({ row }) {
  const name = <span data-testid="source-name">{row.name}</span>;

  if (row.available === false) {
    return (
      <SourceRow muted>
        {name}
        <span className="ml-2 text-[10px] uppercase tracking-wide">
          (not available)
        </span>
      </SourceRow>
    );
  }

  if (row.available == null) {
    return <SourceRow muted>{name}</SourceRow>;
  }

  if (row.url) {
    return <SourceLink href={row.url}>{name}</SourceLink>;
  }

  return <SourceRow>{name}</SourceRow>;
}

export default function SourcesCard({
  sources = [],
  mediaType,
  malLink,
  imdbLink,
  comicvineLink,
  openLibraryLink,
  originalSource,
  exclusiveSource,
  serializationPlatform,
}) {
  // Never re-sort - the server already ordered these by `position`
  // (vocabulary sort_order for `main` rows, insertion order for `other`/
  // `restricted` rows).
  const accessRows = sources.filter((row) => row.kind === "access");
  const referenceRows = sources.filter((row) => row.kind === "reference");

  const tags = [originalSource, exclusiveSource, serializationPlatform].filter(
    Boolean,
  );

  const hasAny =
    accessRows.length > 0 ||
    referenceRows.length > 0 ||
    Boolean(malLink) ||
    Boolean(imdbLink) ||
    Boolean(comicvineLink) ||
    Boolean(openLibraryLink) ||
    tags.length > 0;

  if (!hasAny) {
    return (
      <Slip title="Sources" padded={false}>
        <div className="px-4 py-3 text-sm text-text-faint">
          No sources recorded.
        </div>
      </Slip>
    );
  }

  return (
    <Slip title="Sources" padded={false}>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      {accessRows.length > 0 && (
        <section aria-label={accessHeading(mediaType)}>
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            {accessHeading(mediaType)}
          </div>
          {accessRows.map((row) => (
            <SourceEntry key={row.system_id} row={row} />
          ))}
        </section>
      )}
      {(referenceRows.length > 0 ||
        malLink ||
        imdbLink ||
        comicvineLink ||
        openLibraryLink) && (
        <section aria-label="Where to Look Up">
          <div className="px-4 pt-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            Where to Look Up
          </div>
          {referenceRows.map((row) => (
            <SourceEntry key={row.system_id} row={row} />
          ))}
          {malLink && (
            <SourceLink href={malLink} tag="MAL">
              MyAnimeList
            </SourceLink>
          )}
          {imdbLink && (
            <SourceLink href={imdbLink} tag="IMDb">
              IMDb page
            </SourceLink>
          )}
          {comicvineLink && (
            <SourceLink href={comicvineLink} tag="CV">
              Comic Vine
            </SourceLink>
          )}
          {openLibraryLink && (
            <SourceLink href={openLibraryLink} tag="OL">
              Open Library
            </SourceLink>
          )}
        </section>
      )}
    </Slip>
  );
}
