# The shared pytest lock: why an unbounded wait strands it

Last verified: 2026-09-13

## What this is for

CLAUDE.md's "Coordinated multi-session runs" gives the lock protocol itself
(`mkdir` a directory under Temp, run the suite, `rmdir`). This note is the
failure mode found while several sessions shared that lock during the image
upload feature: two locks were found stranded in one night, and the wrong
fix for a stranded lock is worse than leaving it. Four rules, all one
mechanism.

## The mechanism

The Bash tool's timeout defaults to 120000 ms and caps at 600000 ms (10
minutes). The backend suite takes roughly 330 seconds. A call that holds the
lock and runs the suite with no explicit timeout is backgrounded by the
harness at the two-minute mark — the turn ends, and the `rmdir` that would
release the lock never executes, because it was the next line in a call that
got backgrounded before reaching it.

This is why an **unbounded** wait for the lock is dangerous rather than
merely slow: cap plus suite has to fit under the 600s ceiling, so any queue
longer than roughly 270 seconds guarantees the eventual acquiring call is
backgrounded and its `rmdir` never lands. Under contention, an unbounded wait
does not just delay the waiter — it converts a queue into a stranded lock,
which lengthens the *next* session's queue. The failure mode feeds itself,
which is the reason two stranded locks turned up in one night rather than
one.

## The four rules

1. **Pass `timeout: 600000` explicitly on the Bash call that holds the
   lock.** The tool default (120000 ms) is well under the suite's own
   runtime; without an explicit override, the call backgrounds itself before
   the suite can finish, regardless of how it was launched.
2. **Cap the lock wait so that cap + suite fits under the 600s ceiling.**
   Do not hard-code one number: a fixed cap is one instance of the rule and
   stops being right the day the suite grows. A ~330s suite leaves room for a
   120-180s cap; a 407s suite needs less. Compute the cap from the suite's
   current runtime, and if the lock cannot be acquired inside it, exit
   without running rather than eating into the suite's own budget.
3. **Verify the lock directory is gone before reporting anything green.** A
   report of "suite passed, lock released" is a claim about two different
   things; only one of them is the pytest exit code.
4. **Before clearing any lock, ask the OS whether a live pytest process
   exists — never infer staleness from the lock's age.** The 25-minute
   threshold this replaced is a proxy for staleness and fails in both
   directions: a lock that is actually stranded can look untouched for
   hours, and a lock created seconds ago can belong to a real 8-minute run.

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
     Where-Object { $_.CommandLine -like '*pytest*' } |
     Select-Object ProcessId, CreationDate, CommandLine
   ```

   Empty result plus a lock present = stale; clear it. Non-empty = live;
   wait. The command line names the worktree the process is running in, so
   it also says whose run would be killed by clearing the lock.

## Worked example: presence is not identity

One implementer reported "lock released" after its suite finished. The lock
directory was, at that moment, still present. Under the old age-based rule
this reads as either the implementer lying or the lock having gone stale in
the interim — no way to tell which from the lock alone. Running rule 4's
process check named the actual holder: a *different* worktree
(`anime_site_game_inapplicable`), with two live pytest processes whose
creation timestamps matched the lock's creation time to the second. The
implementer's report was accurate — it had released its own lock — and a
queued session had acquired it within the same second. Clearing on "presence
plus suspicion," which is what the age heuristic amounts to, would have
killed a healthy run belonging to someone else. Presence of the lock
directory says nothing about whose run is inside it; only the process check
does.

## The other half: a worktree needs two databases, not one

`worktree.ps1` names a fresh worktree's database `anime_site_<topic>` and
creates only that one. `tests/api/conftest.py` refuses to run against any
database whose name does not contain the string `test`, so the first `pytest`
run in a new worktree dies in fixture setup with "Refusing to reset
non-test database" — before touching any lock. This is by design, not a gap
in the script: create the second database yourself,
`createdb anime_site_test_<topic>`, before the first run. The failure is the
good kind — loud, roughly 41 seconds to appear, and it dies in collection
rather than reporting anything as passing.
