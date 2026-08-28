// Frontend: the relations canvas.
//
// Nodes are the scope's entries, edges are its media_relation rows, and the
// layout is recomputed only for nodes new to the canvas - see mergePositions
// in lib/relationLayout, without which the graph would rearrange under the
// cursor after every write.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { buildUrl } from "../../api/client";
import { MEDIA_TYPE_COLORS } from "../../config/mediaTypeColors";
import { endpoints } from "../../api/endpoints";
import RelationNode from "./RelationNode";
import FanEdge from "./FanEdge";
import ConnectPopup from "./ConnectPopup";
import EdgeInspector from "./EdgeInspector";
import NodePanel from "./NodePanel";
import {
  GRID,
  kindRank,
  layoutGraph,
  mergePositions,
} from "../../lib/relationLayout";
import {
  describeEntry,
  restoringKind,
  storedTupleFromEdge,
  undoRequest,
} from "../../lib/relationUndo";
import {
  familyGroup,
  handleGroup,
  MIDDLE,
  MIDDLE_SOURCE,
  MIDDLE_TARGET,
  TIMELINE_SOURCE,
  TIMELINE_TARGET,
} from "../../lib/relationHandles";

const nodeTypes = { relation: RelationNode };
const edgeTypes = { fan: FanEdge };

// Matches RelationNode's opacity-20 for a dimmed node, so an edge fades to
// exactly the same depth as the entries it joins.
const DIMMED_OPACITY = 0.2;

// The order the type chips sit in. Taken from the palette rather than from the
// graph, so the row keeps its shape as nodes arrive and as the scope changes -
// a chip that moved every refetch would be clicked by mistake.
const TYPE_ORDER = Object.keys(MEDIA_TYPE_COLORS);

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Only the styling
// lives here; the kinds themselves come from the API.
export const FAMILY_STYLE = {
  timeline: { stroke: "#4f46e5", dash: undefined, arrow: true, showLabel: false },
  // Symmetric, so no arrowhead: neither end is the origin.
  equivalence: { stroke: "#0ea5e9", dash: "6 4", arrow: false, showLabel: true },
  branch: { stroke: "#10b981", dash: undefined, arrow: true, showLabel: true },
  derivation: { stroke: "#f59e0b", dash: "2 4", arrow: true, showLabel: true },
};

// Which query parameter the graph endpoint wants for this tier. All three are
// mutually exclusive server-side, so exactly one key is ever sent.
function scopeParams(scopeType, scopeId) {
  if (scopeType === "series") return { series_id: scopeId };
  if (scopeType === "collection") return { collection_id: scopeId };
  return { franchise_id: scopeId };
}

/**
 * Numbers each branch connector within the fan leaving its source.
 *
 * Returns key -> {index, count}, keyed by system_id. Ordered by kind and then
 * by the target's key, which is exactly the order layoutGraph fans the nodes
 * themselves across the row - the two have to agree, or line 1 reaches past
 * its neighbours to a branch further along and the fan crosses over itself. A
 * hand-dragged node can of course be moved out from under its own line.
 */
export function fanPositions(middleEdges) {
  const bySource = new Map();
  for (const e of middleEdges) {
    if (!bySource.has(e.to)) bySource.set(e.to, []);
    bySource.get(e.to).push(e);
  }
  const fan = new Map();
  for (const group of bySource.values()) {
    const ordered = [...group].sort(
      (a, b) =>
        kindRank(a.relation_type) - kindRank(b.relation_type) ||
        (a.from < b.from ? -1 : 1),
    );
    ordered.forEach((e, index) =>
      fan.set(e.system_id, { index, count: ordered.length }),
    );
  }
  return fan;
}

function toFlowEdges(edges) {
  const fan = fanPositions(edges.filter((e) => familyGroup(e.family) === MIDDLE));
  return edges
    .map((e) => {
      const style = FAMILY_STYLE[e.family] || FAMILY_STYLE.derivation;
      // Which pair of handles the edge lands on, and so which way it reads.
      // Timeline runs across on left/right; the other three families hang
      // down on top/bottom, matching how layoutGraph now places them.
      const middle = familyGroup(e.family) === MIDDLE;
      return {
        id: String(e.system_id),
        // Timeline runs flat along its row, where a step is exactly right and
        // costs nothing. Every other family fans out of one work towards
        // several, and a step would draw each of those at the same gutter
        // height, on top of one another - so those get FanEdge, which spreads
        // them by angle instead. See FanEdge for why that is the fix.
        type: middle ? "fan" : "smoothstep",
        // Reversed, matching layoutGraph: a row reads "`from` is the {label}
        // of `to`", so `to` is the original and `from` the work derived from
        // it. Drawing to->from makes every arrow run from the original to the
        // derivative, left to right along the timeline.
        source: e.to,
        target: e.from,
        sourceHandle: middle ? MIDDLE_SOURCE : TIMELINE_SOURCE,
        targetHandle: middle ? MIDDLE_TARGET : TIMELINE_TARGET,
        // A sequel arrow already says which way the row reads; the other
        // families are ambiguous without their name.
        label: style.showLabel ? e.label : undefined,
        markerEnd: style.arrow ? { type: "arrowclosed", color: style.stroke } : undefined,
        style: { stroke: style.stroke, strokeWidth: 2, strokeDasharray: style.dash },
        // FanEdge renders its label as HTML rather than SVG, so it wants a
        // colour rather than a fill; both are handed over and each edge type
        // reads the one it understands.
        labelStyle: {
          fontSize: 10,
          fontWeight: 800,
          fill: style.stroke,
          color: style.stroke,
        },
        data: middle
          ? {
              ...e,
              fanIndex: fan.get(e.system_id)?.index ?? 0,
              fanCount: fan.get(e.system_id)?.count ?? 1,
            }
          : e,
      };
    });
}

function GraphCanvas({
  scopeType,
  scopeId,
  // Climbs when something outside the canvas writes a relation - the form
  // under it - so the graph re-reads. Its own writes refetch directly.
  reloadNonce = 0,
  onPickGhostFranchise,
  // Reports an in-scope node click upward, so the page's selected entry - the
  // left list's highlight and the form below the canvas - can follow a click
  // on the graph as well as one in the list.
  onSelectNode,
  // Only the two writing surfaces read the vocabulary, so a read-only canvas
  // is not asked to fetch it.
  kinds = [],
  onWrote,
  onError,
  focusKey,
  focusNonce,
  readOnly = false,
}) {
  const [nodes, setNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  // Which media types the toolbar has toggled off. They dim rather than
  // disappear: a graph whose layout has been arranged by hand must not
  // reshuffle every time a type is switched on and off.
  const [hiddenTypes, setHiddenTypes] = useState(new Set());
  const [loading, setLoading] = useState(false);
  // A failed read must not look like an empty scope: the canvas is the whole
  // right pane, so a blank one otherwise reads as "this franchise has no
  // entries and no relations".
  const [loadError, setLoadError] = useState(null);
  // Selection is one-at-a-time: an edge and a node never both hold a panel.
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState(null);
  // Isolate is a separate gesture from selection - a click that both selects
  // and dims the canvas is two actions on one gesture - so it lives in its
  // own state, toggled from the node panel.
  const [isolatedKey, setIsolatedKey] = useState(null);
  // Fullscreen is a class swap on the wrapper below rather than a portal or a
  // second mount: the canvas keeps its nodes, its selection and its viewport
  // across the toggle, where re-parenting the subtree would remount React Flow
  // and throw all three away on the way in and again on the way out.
  const [expanded, setExpanded] = useState(false);
  // Coordinates survive a refetch: only nodes new to the canvas get laid out,
  // so no write moves anything already on it - connecting an entry included.
  // Emptied by Tidy and by a scope switch, which are the only two things that
  // re-run the layout.
  const positionsRef = useRef({});
  // refetch() reports failures through onError, which the page re-renders as a
  // new closure every time; holding it in a ref keeps refetch's identity tied
  // to the scope alone.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const wrapperRef = useRef(null);
  // The drop point for a node-to-node connection. React Flow's own pointerup
  // handling (see @xyflow/system's onPointerUp) calls onConnect BEFORE
  // onConnectEnd, and onConnect receives no event of its own - so onConnect
  // cannot read a point onConnectEnd hasn't written yet. Instead this is kept
  // live by a capture-phase document listener for the same mouseup/touchend
  // events React Flow listens for (in bubble phase), which therefore always
  // runs first and leaves the ref holding the actual drop point, correct even
  // on the very first drag of a fresh page load.
  const lastDropRef = useRef({ x: 0, y: 0 });
  // The single in-flight graph request that matters: refetch() marks any
  // request already sitting here as stale before starting its own, so a
  // scope switch (or another refetch) that races a write-triggered refetch
  // can never let the older response overwrite newer state.
  const activeRequestRef = useRef({ cancelled: true });

  useEffect(() => {
    function captureDropPoint(e) {
      if (e.type === "touchend") {
        const t = e.changedTouches?.[0];
        if (t) lastDropRef.current = { x: t.clientX, y: t.clientY };
      } else {
        lastDropRef.current = { x: e.clientX, y: e.clientY };
      }
    }
    document.addEventListener("mouseup", captureDropPoint, true);
    document.addEventListener("touchend", captureDropPoint, true);
    return () => {
      document.removeEventListener("mouseup", captureDropPoint, true);
      document.removeEventListener("touchend", captureDropPoint, true);
    };
  }, []);

  // The pending connection: set on drop, cleared on confirm or cancel. Holding
  // it here rather than writing immediately is the whole point of the popup.
  const [pending, setPending] = useState(null); // {source, target, position}
  const [connectError, setConnectError] = useState(null);
  const [writing, setWriting] = useState(false);
  // The session's writes, newest last, each holding the one request that
  // reverses it. Deliberately survives a scope switch - a relation belongs to
  // no tier, so the row undo would act on is often not the canvas you are
  // looking at - and deliberately dies with the page.
  const [history, setHistory] = useState([]);
  // Bumped every time a drag is dropped, so a second drag that re-points the
  // still-mounted popup at a new pair forces React to remount ConnectPopup
  // instead of reusing its internal kind/remark/swapped/query/picked state.
  const attemptIdRef = useRef(0);

  // Escape leaves fullscreen, and the page behind stops scrolling under it.
  // Both are undone by the cleanup rather than by the button, so a route
  // change while expanded gives the body its scrollbar back too - a canvas
  // that unmounted still holding `overflow: hidden` would freeze the site.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e) => {
      // ConnectPopup binds Escape to cancelling itself. With a drag waiting to
      // be confirmed, that is what the key is for - collapsing as well would
      // answer one Escape with two dismissals.
      if (e.key === "Escape" && !pending) setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded, pending]);

  useEffect(() => {
    // A scope change is a different canvas, so nothing carries over.
    positionsRef.current = {};
    setSelectedEdgeId(null);
    setSelectedNodeKey(null);
    setIsolatedKey(null);
    // A pending popup still holds two entries from the old canvas; confirming
    // it after the switch would write a relation between entries that are
    // nowhere on screen.
    setPending(null);
    setConnectError(null);
  }, [scopeType, scopeId]);

  // The left pane picks an entry by "type:id"; the canvas answers by opening
  // that node's panel. focusNonce, not focusKey alone: closing the panel and
  // clicking the same entry again must reopen it, and the key has not changed.
  useEffect(() => {
    if (!focusKey) return;
    setSelectedEdgeId(null);
    setSelectedNodeKey(focusKey);
  }, [focusKey, focusNonce]);

  const refetch = useCallback(() => {
    // A new request supersedes whatever was previously in flight - whether
    // that was this same effect's last run or a write-triggered refetch -
    // so its response can never land after this one's.
    activeRequestRef.current.cancelled = true;
    const requestToken = { cancelled: false };
    activeRequestRef.current = requestToken;

    if (!scopeId) {
      setNodes([]);
      setGraphEdges([]);
      setLoadError(null);
      return () => {
        requestToken.cancelled = true;
      };
    }
    setLoading(true);
    const params = scopeParams(scopeType, scopeId);

    fetch(buildUrl(endpoints.mediaRelation.graph(), params), {
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load the graph (${r.status}).`);
        return r.json();
      })
      .then((body) => {
        if (requestToken.cancelled) return;
        const positioned = mergePositions(
          positionsRef.current,
          layoutGraph(body),
        );
        positionsRef.current = Object.fromEntries(
          positioned.map((n) => [n.key, { position: n.position, section: n.section }]),
        );
        setNodes(
          positioned.map((n) => ({
            id: n.key,
            type: "relation",
            position: n.position,
            data: n,
          })),
        );
        setGraphEdges(body.edges);
        setLoadError(null);
      })
      .catch((e) => {
        // A request the scope switched away from is not a failure anyone
        // needs told about - and its canvas is already gone.
        if (requestToken.cancelled) return;
        const message = e?.message || "Could not reach the server.";
        // Cleared rather than left stale: half a graph from the previous read
        // sitting under an error banner would be worse than an honest blank.
        setNodes([]);
        setGraphEdges([]);
        setLoadError(message);
        onErrorRef.current?.(message);
      })
      .finally(() => !requestToken.cancelled && setLoading(false));

    return () => {
      requestToken.cancelled = true;
    };
  }, [scopeType, scopeId]);

  useEffect(() => {
    const cancel = refetch();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, scopeId, reloadNonce]);

  const nodeByKey = useCallback(
    (key) => nodes.find((n) => n.id === key)?.data || null,
    [nodes],
  );

  function toContainerPoint(point) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return point;
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  // A timeline handle may only meet a timeline handle. Refusing the pair here
  // rather than in the popup means a cross-group drag never snaps, so the
  // rule is visible while dragging instead of arriving as an error afterwards.
  const isValidConnection = useCallback(
    (connection) =>
      handleGroup(connection.sourceHandle) ===
      handleGroup(connection.targetHandle),
    [],
  );

  // Drop on a node: both endpoints are known, so the popup only needs a kind.
  const onConnect = useCallback(
    (connection) => {
      if (readOnly) return;
      setConnectError(null);
      attemptIdRef.current += 1;
      setPending({
        attemptId: attemptIdRef.current,
        source: nodeByKey(connection.source),
        target: nodeByKey(connection.target),
        // isValidConnection has already refused a mismatched pair, so either
        // end names the same group.
        group: handleGroup(connection.sourceHandle),
        position: toContainerPoint(lastDropRef.current),
      });
    },
    [nodeByKey, readOnly],
  );

  // Drop on empty canvas: the far endpoint is unknown, so the popup opens with
  // a global search. This is how a link that leaves the franchise gets made.
  const onConnectEnd = useCallback(
    (event, connectionState) => {
      const point = {
        x: event.clientX ?? event.changedTouches?.[0]?.clientX ?? 0,
        y: event.clientY ?? event.changedTouches?.[0]?.clientY ?? 0,
      };
      lastDropRef.current = point;
      if (readOnly) return;
      // A valid drop is onConnect's job; only the miss lands here.
      if (connectionState?.isValid) return;
      const fromKey = connectionState?.fromNode?.id;
      if (!fromKey) return;
      setConnectError(null);
      attemptIdRef.current += 1;
      setPending({
        attemptId: attemptIdRef.current,
        source: nodeByKey(fromKey),
        target: null,
        // No far end to agree with, so the handle the drag started from is the
        // only thing that says which kinds this can become. A backwards drag
        // off a top handle reports `middle-target`, which handleGroup reads
        // the same as `middle-source`.
        group: handleGroup(connectionState?.fromHandle?.id),
        position: toContainerPoint(point),
      });
    },
    [nodeByKey, readOnly],
  );

  // A read-only canvas never writes, so it never records; guarding here keeps
  // every call site from having to remember that.
  function push(entry) {
    if (readOnly) return;
    setHistory((stack) => [...stack, entry]);
  }

  const lastEntry = history[history.length - 1] || null;

  /**
   * Reverse the newest write.
   *
   * The entry is dropped whatever the outcome. A failure here means the row
   * moved on beneath us - someone else deleted it, or the reverse would now
   * duplicate an existing relation - and neither gets better on a retry, so
   * leaving it on the stack would only let the button promise something it
   * cannot do.
   */
  async function undoLast() {
    if (writing || !lastEntry) return;
    const request = undoRequest(lastEntry);
    setHistory((stack) => stack.slice(0, -1));
    setWriting(true);
    try {
      const url =
        request.method === "DELETE"
          ? endpoints.mediaRelation.remove(request.id)
          : request.method === "PATCH"
            ? endpoints.mediaRelation.patch(request.id)
            : endpoints.mediaRelation.create();
      const res = await fetch(url, {
        method: request.method,
        credentials: "include",
        ...(request.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request.body),
            }
          : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError?.(data?.detail || res.statusText);
        return;
      }
      // The edge the inspector was showing may be the one just reversed, and
      // a panel describing a row that no longer exists is worse than none.
      setSelectedEdgeId(null);
      onWrote?.();
      refetch();
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
    } finally {
      setWriting(false);
    }
  }

  // A 409 (duplicate or self-relation) leaves the popup open with the message:
  // closing it back to the canvas would lose the kind and remark just typed.
  async function createRelation({ kind, from, to, remark, label, fromName, toName }) {
    // Two Enter presses in the same tick, before writing/disabling the
    // button re-renders, would otherwise fire two POSTs.
    if (writing) return;
    const [fromType, fromId] = from.split(":");
    const [toType, toId] = to.split(":");
    setWriting(true);
    setConnectError(null);
    try {
      const res = await fetch(endpoints.mediaRelation.create(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_type: fromType,
          from_id: fromId,
          kind,
          to_type: toType,
          to_id: toId,
          remark,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConnectError(data?.detail || res.statusText);
        return;
      }
      // The response carries the new system_id, which is the only handle undo
      // has on a row it just made.
      const created = await res.json().catch(() => null);
      if (created) {
        push({
          action: "create",
          created,
          label: label || kind,
          sourceName: fromName || "an entry",
          targetName: toName || "an entry",
        });
      }
      setPending(null);
      onWrote?.();
      refetch();
    } catch (e) {
      // A network failure or offline rejects the fetch outright: without
      // this, the popup would sit open with no message and a button that
      // looks dead, and the rejection would escape unhandled.
      setConnectError(e?.message || "Could not reach the server.");
    } finally {
      setWriting(false);
    }
  }

  const onNodesChange = useCallback((changes) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      // Remember a hand-drag, so it too survives the next refetch. The
      // section rides along unchanged: only the server's edges decide it.
      for (const n of next) {
        positionsRef.current[n.id] = {
          position: n.position,
          section: positionsRef.current[n.id]?.section ?? n.data?.section,
        };
      }
      return next;
    });
  }, []);

  // Isolate keeps the node and everything one hop from it; the rest dims.
  const neighbours = useMemo(() => {
    if (!isolatedKey) return null;
    const set = new Set([isolatedKey]);
    for (const e of graphEdges) {
      if (e.from === isolatedKey) set.add(e.to);
      if (e.to === isolatedKey) set.add(e.from);
    }
    return set;
  }, [isolatedKey, graphEdges]);

  // One chip per media type actually on the canvas, labelled the way the node
  // badge labels it. Deriving the row from the graph rather than from all
  // eight known types keeps it from offering a toggle that dims nothing.
  const presentTypes = useMemo(() => {
    const labels = new Map();
    for (const n of nodes) {
      const type = n.data?.media_type;
      if (!type || labels.has(type)) continue;
      labels.set(type, n.data?.type_label || type);
    }
    const known = TYPE_ORDER.filter((t) => labels.has(t));
    // A type the palette has not been taught about still gets a chip, after
    // the ones it knows, rather than silently losing its filter.
    const rest = [...labels.keys()].filter((t) => !TYPE_ORDER.includes(t));
    return [...known, ...rest].map((type) => ({ type, label: labels.get(type) }));
  }, [nodes]);

  // Switching scope can retire a type entirely. Dropping it from the hidden
  // set as it goes stops a toggle made in one franchise from silently dimming
  // another the moment the same type reappears there.
  useEffect(() => {
    const present = new Set(presentTypes.map((t) => t.type));
    setHiddenTypes((current) => {
      const next = new Set([...current].filter((t) => present.has(t)));
      return next.size === current.size ? current : next;
    });
  }, [presentTypes]);

  const typeOfNode = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.data?.media_type])),
    [nodes],
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        // The ring follows selectedNodeKey rather than React Flow's own
        // selection, so the two ways of choosing an entry look the same: a
        // canvas click sets the key through onNodeClick, and a click in the
        // left pane sets it through focusKey - which used to open the panel
        // while leaving the node itself unmarked.
        selected: n.id === selectedNodeKey,
        data: {
          ...n.data,
          // Two gestures dim, and they compose: isolate drops everything more
          // than a hop away, the type chips drop a whole media type. Finding
          // an entry is neither - that is the left pane's filter, which
          // scrolls the list and focuses the node.
          dimmed:
            (neighbours ? !neighbours.has(n.id) : false) ||
            hiddenTypes.has(n.data.media_type),
        },
      })),
    [nodes, neighbours, selectedNodeKey, hiddenTypes],
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeKey)?.data || null,
    [nodes, selectedNodeKey],
  );

  // Labelled for the side being viewed: a row reads "from is the {label} of
  // to", so from this node's side the far entry carries the inverse label.
  const selectedNodeRelations = useMemo(() => {
    if (!selectedNodeKey) return [];
    const name = (key) =>
      nodes.find((n) => n.id === key)?.data?.display_name || "a missing entry";
    return graphEdges
      .filter((e) => e.from === selectedNodeKey || e.to === selectedNodeKey)
      .map((e) => {
        const forward = e.from === selectedNodeKey;
        return {
          system_id: e.system_id,
          label: forward ? e.inverse_label : e.label,
          otherName: name(forward ? e.to : e.from),
          family: e.family,
        };
      });
  }, [graphEdges, selectedNodeKey, nodes]);

  // Both endpoint names travel with the edge, for the inspector's sentence.
  const selectedEdge = useMemo(() => {
    const found = graphEdges.find((e) => String(e.system_id) === selectedEdgeId);
    if (!found) return null;
    const name = (key) =>
      nodes.find((n) => n.id === key)?.data?.display_name || "a missing entry";
    return { ...found, sourceName: name(found.from), targetName: name(found.to) };
  }, [graphEdges, selectedEdgeId, nodes]);

  // Returns whether the row was actually written, so the inspector can put its
  // remark box back to the saved text when it was not.
  async function patchRelation(body) {
    if (writing || !selectedEdge) return false;
    // Read before the write: once it lands, the row that was there is gone.
    const before = storedTupleFromEdge(selectedEdge);
    const { sourceName, targetName, label } = selectedEdge;
    setWriting(true);
    try {
      const res = await fetch(
        endpoints.mediaRelation.patch(selectedEdge.system_id),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError?.(data?.detail || res.statusText);
        return false;
      }
      // The updated row comes back, so the restoring kind is settled here
      // rather than left to depend on whatever is on canvas at undo time.
      const after = await res.json().catch(() => null);
      if (after) {
        push({
          action: "edit",
          id: after.system_id,
          kind: restoringKind(before, after, kinds),
          // A swap is reversed by swapping back, not by replaying a kind -
          // see undoRequest for why the two cannot be the same request.
          swap: body.swap === true,
          before,
          label,
          sourceName,
          targetName,
        });
      }
      onWrote?.();
      refetch();
      return true;
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
      return false;
    } finally {
      setWriting(false);
    }
  }

  async function deleteRelation() {
    if (writing || !selectedEdge) return;
    if (
      !window.confirm(
        `Remove the "${selectedEdge.label}" link between ${selectedEdge.sourceName} and ${selectedEdge.targetName}? The entries themselves are not touched.`,
      )
    )
      return;
    // Everything undo needs to post the row back, read while it still exists.
    const before = storedTupleFromEdge(selectedEdge);
    const { sourceName, targetName, label } = selectedEdge;
    setWriting(true);
    try {
      const res = await fetch(
        endpoints.mediaRelation.remove(selectedEdge.system_id),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        onError?.(res.statusText);
        return;
      }
      push({ action: "delete", before, label, sourceName, targetName });
      setSelectedEdgeId(null);
      onWrote?.();
      refetch();
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
    } finally {
      setWriting(false);
    }
  }

  /**
   * Clears every relation in the scope, in one request.
   *
   * Server-side rather than a loop of deletes over graphEdges: a loop that
   * fails partway leaves a half-reset scope and no record of which half, and
   * the canvas draws relations reaching out to entries it does not itself
   * hold, which the scope query on the server already accounts for.
   *
   * Not undoable, by decision, so the stack is emptied rather than pushed to:
   * undo replays inverses against live rows, and after this every row it
   * remembers is gone. The deleted-record log is where a mistaken reset is
   * recovered from.
   */
  async function resetScope() {
    if (writing || graphEdges.length === 0) return;
    const count = graphEdges.length;
    if (
      !window.confirm(
        `Remove all ${count} relation${count === 1 ? "" : "s"} in this ${scopeType}? ` +
          "The entries themselves are not touched, and this cannot be undone.",
      )
    )
      return;
    setWriting(true);
    try {
      const res = await fetch(
        buildUrl(endpoints.mediaRelation.resetScope(), scopeParams(scopeType, scopeId)),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError?.(data?.detail || res.statusText);
        return;
      }
      setHistory([]);
      setSelectedEdgeId(null);
      onWrote?.();
      refetch();
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
    } finally {
      setWriting(false);
    }
  }

  const flowEdges = useMemo(() => {
    const hidden = (key) => hiddenTypes.has(typeOfNode.get(key));
    return toFlowEdges(graphEdges).map((e) => {
      // An edge is only as visible as the entries it joins: dimming a type
      // while its lines stay solid leaves the canvas as busy as before.
      if (!hidden(e.source) && !hidden(e.target)) return e;
      return {
        ...e,
        style: { ...e.style, opacity: DIMMED_OPACITY },
        labelStyle: { ...e.labelStyle, opacity: DIMMED_OPACITY },
      };
    });
  }, [graphEdges, hiddenTypes, typeOfNode]);

  function toggleType(mediaType) {
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(mediaType)) next.delete(mediaType);
      else next.add(mediaType);
      return next;
    });
  }

  function onNodeClick(_event, node) {
    // A ghost belongs to another franchise; clicking it moves the lens there.
    if (!node.data.in_scope && node.data.franchise_id) {
      onPickGhostFranchise?.(node.data.franchise_id);
      return;
    }
    setSelectedEdgeId(null);
    setSelectedNodeKey(node.id);
    // The page keeps one selected entry, which the left list and the form
    // under the canvas both read. Reported for in-scope nodes only: a ghost is
    // not in the scope's entry list, and it has already been handled above.
    onSelectNode?.(node.id);
  }

  function onEdgeClick(_event, edge) {
    setSelectedNodeKey(null);
    setSelectedEdgeId(edge.id);
  }

  // Throws away every hand-dragged coordinate and takes the computed layout
  // again. mergePositions only preserves what the ref holds, so emptying it is
  // the whole reset - without this a drag is permanent, since a refetch keeps
  // the old position on purpose so adding a relation cannot shuffle the canvas.
  function tidy() {
    positionsRef.current = {};
    refetch();
  }

  if (!scopeId) {
    return (
      <div className="flex h-[36rem] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
        <p className="text-sm font-medium text-gray-400">
          Pick a {scopeType} to see its relations.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col gap-2 ${
        // z-[90] rather than z-50: the sticky nav and the scroll buttons in
        // Layout are both z-50, and a tie between them would be settled by
        // document order - which puts the scroll buttons over the minimap.
        // Toasts stay above at z-[100], so a write still reports itself here.
        expanded ? "fixed inset-0 z-[90] bg-white p-4" : "relative"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? null : (
          <button
            type="button"
            onClick={undoLast}
            disabled={!lastEntry || writing}
            // Spelt out rather than "Undo last change": the stack outlives a
            // scope switch, so the row being reversed is not always one the
            // current canvas shows.
            title={describeEntry(lastEntry)}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600 transition-opacity hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <i className="fas fa-rotate-left"></i>
            Undo
            {history.length > 1 ? (
              <span className="rounded-full bg-gray-200 px-1.5 text-[9px] text-gray-600">
                {history.length}
              </span>
            ) : null}
          </button>
        )}

        {readOnly ? null : (
          <button
            type="button"
            onClick={tidy}
            disabled={writing || loading || nodes.length === 0}
            title="Drop every hand-placed position and re-run the automatic layout"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600 transition-opacity hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <i className="fas fa-wand-magic-sparkles"></i>
            Tidy
          </button>
        )}

        {readOnly ? null : (
          <button
            type="button"
            onClick={resetScope}
            disabled={writing || loading || graphEdges.length === 0}
            title={`Remove every relation in this ${scopeType}. The entries are not touched, and this cannot be undone`}
            className="flex items-center gap-1.5 rounded-full border border-red-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-500 transition-opacity hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <i className="fas fa-trash"></i>
            Reset
          </button>
        )}

        {presentTypes.map(({ type, label }) => {
          const on = !hiddenTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              onClick={() => toggleType(type)}
              title={`${on ? "Dim" : "Restore"} every ${label} on the canvas`}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-opacity ${
                on ? "border-gray-200 text-gray-600" : "border-gray-100 text-gray-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  (MEDIA_TYPE_COLORS[type] || {}).dot || "bg-gray-400"
                } ${on ? "" : "opacity-40"}`}
              />
              {label}
            </button>
          );
        })}

        {/* Last in the row and pushed to the far end, so the chips keep the
            positions they have today however many of them the scope shows. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-pressed={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          title={
            expanded
              ? "Return the graph to the page (Escape)"
              : "Fill the window with the graph"
          }
          className="ml-auto flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600 transition-opacity hover:bg-gray-50"
        >
          <i className={`fas ${expanded ? "fa-compress" : "fa-expand"}`}></i>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* The positioning context for the two panels: anchored here rather
          than on the outer wrapper, they overlay the canvas only and never
          cover the toolbar above it, whose height changes as it wraps. */}
      <div
        className={`relative rounded-2xl border border-gray-200 bg-gray-50 ${
          // min-h-0 so the flex child may shrink below the canvas's content
          // height instead of pushing the toolbar off the top of the screen.
          expanded ? "min-h-0 flex-1" : "h-[36rem]"
        }`}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          // A read-only canvas is a fixed picture: the layout is the graph's
          // own statement about how these entries relate, so neither dragging
          // a node nor starting a connection from one is offered.
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          // The same lattice layoutGraph computes on and Background draws, so
          // a dragged node lines up with the ones it was dropped beside
          // instead of landing a few pixels off every neighbour.
          snapToGrid
          snapGrid={[GRID, GRID]}
          fitView
          minZoom={0.15}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={GRID} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {/* Three different blanks, three different messages: a read that
            failed, a scope with nothing in it, and a scope still loading. */}
        {loadError ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-xl border border-red-200 bg-white p-4 text-center shadow-lg">
              <p className="text-sm font-black text-red-500">
                Could not load this {scopeType}&apos;s relations.
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">{loadError}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-gray-600 hover:bg-gray-50"
              >
                Try again
              </button>
            </div>
          </div>
        ) : !loading && nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <p className="text-sm font-medium text-gray-400">
              This {scopeType} has no entries yet.
            </p>
          </div>
        ) : null}

        {selectedNode ? (
          <NodePanel
            node={selectedNode}
            relations={selectedNodeRelations}
            isolated={isolatedKey === selectedNodeKey}
            onToggleIsolate={() =>
              setIsolatedKey((k) => (k === selectedNodeKey ? null : selectedNodeKey))
            }
            onClose={() => setSelectedNodeKey(null)}
          />
        ) : null}

        {selectedEdge ? (
          <EdgeInspector
            // A kind change rewrites the row, so the inspector's uncontrolled
            // remark box has to re-seed from the refetched edge.
            key={String(selectedEdge.system_id) + selectedEdge.relation_type}
            edge={selectedEdge}
            kinds={kinds}
            busy={writing}
            readOnly={readOnly}
            onPatch={patchRelation}
            onDelete={deleteRelation}
            onClose={() => setSelectedEdgeId(null)}
          />
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs font-bold text-gray-400">Loading graph…</p>
      ) : null}

      {pending && !readOnly ? (
        <ConnectPopup
          key={pending.attemptId}
          kinds={kinds}
          source={pending.source}
          target={pending.target}
          group={pending.group}
          position={pending.position}
          error={connectError}
          busy={writing}
          onConfirm={createRelation}
          onCancel={() => {
            setPending(null);
            setConnectError(null);
          }}
        />
      ) : null}
    </div>
  );
}

// React Flow's hooks require the provider above the component that uses them.
export default function RelationGraph(props) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
