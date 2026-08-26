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
import { endpoints } from "../../api/endpoints";
import RelationNode from "./RelationNode";
import ConnectPopup from "./ConnectPopup";
import EdgeInspector from "./EdgeInspector";
import NodePanel from "./NodePanel";
import { layoutGraph, mergePositions } from "../../lib/relationLayout";

const nodeTypes = { relation: RelationNode };

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Only the styling
// lives here; the kinds themselves come from the API.
export const FAMILY_STYLE = {
  timeline: { stroke: "#4f46e5", dash: undefined, arrow: true, showLabel: false },
  // Symmetric, so no arrowhead: neither end is the origin.
  equivalence: { stroke: "#0ea5e9", dash: "6 4", arrow: false, showLabel: true },
  branch: { stroke: "#10b981", dash: undefined, arrow: true, showLabel: true },
  derivation: { stroke: "#f59e0b", dash: "2 4", arrow: true, showLabel: true },
};

export const FAMILY_LABELS = {
  timeline: "Timeline",
  equivalence: "Equivalence",
  branch: "Branch",
  derivation: "Derivation",
};

function toFlowEdges(edges, hiddenFamilies) {
  return edges
    .filter((e) => !hiddenFamilies.has(e.family))
    .map((e) => {
      const style = FAMILY_STYLE[e.family] || FAMILY_STYLE.derivation;
      return {
        id: String(e.system_id),
        // Reversed, matching layoutGraph: a row reads "`from` is the {label}
        // of `to`", so `to` is the original and `from` the work derived from
        // it. Drawing to->from makes every arrow run from the original to the
        // derivative, left to right along the timeline.
        source: e.to,
        target: e.from,
        // A sequel arrow already says which way the row reads; the other
        // families are ambiguous without their name.
        label: style.showLabel ? e.label : undefined,
        markerEnd: style.arrow ? { type: "arrowclosed", color: style.stroke } : undefined,
        style: { stroke: style.stroke, strokeWidth: 2, strokeDasharray: style.dash },
        labelStyle: { fontSize: 10, fontWeight: 800, fill: style.stroke },
        data: e,
      };
    });
}

function GraphCanvas({
  scopeType,
  scopeId,
  onPickGhostFranchise,
  refreshKey,
  kinds,
  onWrote,
  onError,
  focusKey,
}) {
  const [nodes, setNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [hiddenFamilies, setHiddenFamilies] = useState(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  // Selection is one-at-a-time: an edge and a node never both hold a panel.
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState(null);
  // Isolate is a separate gesture from selection - a click that both selects
  // and dims the canvas is two actions on one gesture - so it lives in its
  // own state, toggled from the node panel.
  const [isolatedKey, setIsolatedKey] = useState(null);
  // Coordinates survive a refetch: only nodes new to the canvas get laid out.
  const positionsRef = useRef({});
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
  // Bumped every time a drag is dropped, so a second drag that re-points the
  // still-mounted popup at a new pair forces React to remount ConnectPopup
  // instead of reusing its internal kind/remark/swapped/query/picked state.
  const attemptIdRef = useRef(0);

  useEffect(() => {
    // A scope change is a different canvas, so nothing carries over.
    positionsRef.current = {};
    setSelectedEdgeId(null);
    setSelectedNodeKey(null);
    setIsolatedKey(null);
  }, [scopeType, scopeId]);

  // The left pane picks an entry by "type:id"; the canvas answers by opening
  // that node's panel.
  useEffect(() => {
    if (!focusKey) return;
    setSelectedEdgeId(null);
    setSelectedNodeKey(focusKey);
  }, [focusKey]);

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
      return () => {
        requestToken.cancelled = true;
      };
    }
    setLoading(true);
    const params =
      scopeType === "franchise"
        ? { franchise_id: scopeId }
        : { collection_id: scopeId };

    fetch(buildUrl(endpoints.mediaRelation.graph(), params), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .then((body) => {
        if (requestToken.cancelled) return;
        const positioned = mergePositions(
          positionsRef.current,
          layoutGraph(body),
        );
        positionsRef.current = Object.fromEntries(
          positioned.map((n) => [n.key, n.position]),
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
  }, [scopeType, scopeId, refreshKey]);

  const nodeByKey = useCallback(
    (key) => nodes.find((n) => n.id === key)?.data || null,
    [nodes],
  );

  function toContainerPoint(point) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return point;
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  // Drop on a node: both endpoints are known, so the popup only needs a kind.
  const onConnect = useCallback(
    (connection) => {
      setConnectError(null);
      attemptIdRef.current += 1;
      setPending({
        attemptId: attemptIdRef.current,
        source: nodeByKey(connection.source),
        target: nodeByKey(connection.target),
        position: toContainerPoint(lastDropRef.current),
      });
    },
    [nodeByKey],
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
        position: toContainerPoint(point),
      });
    },
    [nodeByKey],
  );

  // A 409 (duplicate or self-relation) leaves the popup open with the message:
  // closing it back to the canvas would lose the kind and remark just typed.
  async function createRelation({ kind, from, to, remark }) {
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
      // Remember a hand-drag, so it too survives the next refetch.
      for (const n of next) positionsRef.current[n.id] = n.position;
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

  const needle = query.trim().toLowerCase();
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const missesNeedle =
          needle.length > 0 &&
          ![n.data.display_name || "", ...(n.data.search_names || [])]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        return {
          ...n,
          data: {
            ...n.data,
            // Either reason dims: outside the isolated neighbourhood, or
            // missed by the search box.
            dimmed: missesNeedle || (neighbours ? !neighbours.has(n.id) : false),
          },
        };
      }),
    [nodes, needle, neighbours],
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

  async function patchRelation(body) {
    if (writing || !selectedEdge) return;
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
        return;
      }
      onWrote?.();
      refetch();
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
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
      setSelectedEdgeId(null);
      onWrote?.();
      refetch();
    } catch (e) {
      onError?.(e?.message || "Could not reach the server.");
    } finally {
      setWriting(false);
    }
  }

  const flowEdges = useMemo(
    () => toFlowEdges(graphEdges, hiddenFamilies),
    [graphEdges, hiddenFamilies],
  );

  function toggleFamily(family) {
    setHiddenFamilies((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family);
      else next.add(family);
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
  }

  function onEdgeClick(_event, edge) {
    setSelectedNodeKey(null);
    setSelectedEdgeId(edge.id);
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
    <div ref={wrapperRef} className="relative flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Highlight an entry…"
          className="flex-1 min-w-[12rem] rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {Object.keys(FAMILY_LABELS).map((family) => {
          const on = !hiddenFamilies.has(family);
          return (
            <button
              key={family}
              type="button"
              onClick={() => toggleFamily(family)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-opacity ${
                on ? "border-gray-200 text-gray-600" : "border-gray-100 text-gray-300"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: FAMILY_STYLE[family].stroke }}
              />
              {FAMILY_LABELS[family]}
            </button>
          );
        })}
      </div>

      {/* The positioning context for the two panels: anchored here rather
          than on the outer wrapper, they overlay the canvas only and never
          cover the toolbar above it, whose height changes as it wraps. */}
      <div className="relative h-[36rem] rounded-2xl border border-gray-200 bg-gray-50">
        <ReactFlow
          nodes={displayNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          fitView
          minZoom={0.15}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>

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
            onPatch={patchRelation}
            onDelete={deleteRelation}
            onClose={() => setSelectedEdgeId(null)}
          />
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs font-bold text-gray-400">Loading graph…</p>
      ) : null}

      {pending ? (
        <ConnectPopup
          key={pending.attemptId}
          kinds={kinds}
          source={pending.source}
          target={pending.target}
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
