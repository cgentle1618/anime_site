// Frontend: library config per media type, keyed by MEDIA_CONFIG key. A type
// listed here has a /library/<type> page.
import anime from "./anime";
import animeMovie from "./animeMovie";
import movie from "./movie";
import tvShow from "./tvShow";
import cartoon from "./cartoon";
import manga from "./manga";
import novel from "./novel";
import comic from "./comic";

export const LIBRARY_CONFIGS = {
  anime,
  "anime-movie": animeMovie,
  movie,
  "tv-show": tvShow,
  cartoon,
  manga,
  novel,
  comic,
};
