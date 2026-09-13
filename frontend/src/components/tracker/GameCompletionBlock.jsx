// Frontend: the four completion axes on the game detail page.
//
// These are answers about a playthrough, not facts about the game, which is
// why they sit beside My tracker rather than in the Information card: the
// release date is true whoever is looking, and "did I see every ending" is
// not. Read-only rows there also meant the only way to change one was to open
// the Modify page for a single dropdown.
//
// Kept out of MyTrackerCard deliberately - that component serves nine media
// types and these four columns exist only on games. Same shape as
// NovelTrackerBlock, which is the precedent for per-type tracker UI.
import { useAuth } from "../../contexts/AuthContext";
import { Chip, Eyebrow, Slip } from "../ui/primitives";
import { SELECT_CLS } from "./MyTrackerCard";
import {
  COMPLETION_LEVELS,
  GAME_COMPLETION_FLAGS,
} from "../../config/fieldOptions";

// Field key -> label and vocabulary. Completion Level is a ladder of depth and
// the other three are independent axes, so the ladder leads and the axes
// follow it in the order the Add form uses.
const AXES = [
  ["completion_level", "Completion Level", COMPLETION_LEVELS],
  ["all_endings", "All Endings", GAME_COMPLETION_FLAGS],
  ["all_achievements", "All Achievements", GAME_COMPLETION_FLAGS],
  ["all_collected", "All Collected", GAME_COMPLETION_FLAGS],
];

export default function GameCompletionBlock({ game, isAdmin, onChange }) {
  // A guest has no completion record, for the same reason they have no
  // tracker: every field here is one person's answer. Guarded in the component
  // rather than at the page, matching MyTrackerCard and NovelTrackerBlock.
  const { username } = useAuth();
  if (!username) return null;

  return (
    <Slip title="Completion">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {AXES.map(([key, label, options]) => (
          <div key={key} className="space-y-1.5">
            <Eyebrow as="label" htmlFor={`game-${key}`} className="block">
              {label}
            </Eyebrow>
            {isAdmin ? (
              <select
                id={`game-${key}`}
                value={game[key] || ""}
                onChange={(e) =>
                  // "" is the select's unset option; the column's unrecorded
                  // state is NULL, so an emptied axis must not travel as "".
                  onChange({ [key]: e.target.value || null })
                }
                className={SELECT_CLS}
              >
                <option value="">—</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <Chip>{game[key] || "—"}</Chip>
              </div>
            )}
          </div>
        ))}
      </div>
    </Slip>
  );
}
