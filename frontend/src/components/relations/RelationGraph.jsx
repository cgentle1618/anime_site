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
}) {
  const [nodes, setNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [hiddenFamilies, setHiddenFamilies] = useState(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  // Coordinates survive a refetch: only nodes new to the canvas get laid out.
  const positionsRef = useRef({});
  const wrapperRef = useRef(null);
  const lastDropRef = useRef({ x: 0, y: 0 });

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
  }, [scopeType, scopeId]);

  const refetch = useCallback(() => {
    if (!scopeId) {
      setNodes([]);
      setGraphEdges([]);
      return () => {};
    }
    let cancelled = false;
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
        if (cancelled) return;
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
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
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

  const needle = query.trim().toLowerCase();
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          dimmed:
            needle.length > 0 &&
            ![n.data.display_name || "", ...(n.data.search_names || [])]
              .join(" ")
              .toLowerCase()
              .includes(needle),
        },
      })),
    [nodes, needle],
  );

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
    }
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

      <div className="h-[36rem] rounded-2xl border border-gray-200 bg-gray-50">
        <ReactFlow
          nodes={displayNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
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
