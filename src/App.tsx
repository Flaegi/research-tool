// Main application — node-based research environment.
// Visualizes a research conversation as an interactive knowledge map.
// ClusterZone nodes define territories; ConceptNode cards show research items.
import React, { useState, useCallback } from 'react';
import { Activity, Sparkles, Sun, Moon, Save, Layers } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ViewModeContext } from './context';
import {
  ReactFlow, Background, applyNodeChanges, applyEdgeChanges, addEdge,
  Connection, Edge, NodeChange, EdgeChange, ReactFlowProvider, useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ConceptNode } from './components/concept-node';
import { ClusterZone } from './components/cluster-zone';

// ----- Constants -----

/** Muted cartographic palette — like map biomes, no neon */
const CLUSTER_PALETTE: Array<{ color: string; pattern: 'diagonal' | 'dots' | 'crosshatch' | 'waves' | 'none' }> = [
  { color: '#6b8f71', pattern: 'diagonal' },    // moss green
  { color: '#7b8fa1', pattern: 'dots' },         // steel blue
  { color: '#8f7b6b', pattern: 'crosshatch' },   // terracotta
  { color: '#8a7f9e', pattern: 'waves' },        // lavender
  { color: '#9e8a6b', pattern: 'none' },         // sandstone
];

/** Neutral map-road edge style — no color, no glow, no animation */
const MAP_EDGE_STYLE: Partial<Edge> = {
  style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.2 },
  markerEnd: { type: MarkerType.Arrow, width: 10, height: 10, color: 'rgba(255,255,255,0.18)' },
  animated: false,
};

/** Base spawn radius — scales down with depth so deeper clusters are tighter */
const BASE_SPAWN_RADIUS = 500;
/** Padding around the bounding box of children for zone sizing */
const ZONE_PADDING = 280;

// ----- Topic Expansion Mock-LLM -----

/**
 * Simulates an LLM topic expansion.
 * Returns 3–4 contextually plausible sub-topics for a given research term.
 */
const expandTopic = (topic: string, depth: number = 0): string[] => {
  const t = topic.toLowerCase();
  // Domain-specific expansions for common seeds
  const expansions: Record<string, string[]> = {
    quantum: ['Quantum Entanglement', 'Quantum Decoherence', 'Topological Qubits', 'Quantum Error Correction'],
    biology: ['Epigenetics', 'Synthetic Biology', 'Proteomics', 'Microbiome Dynamics'],
    ai: ['Transformer Architecture', 'Reinforcement Learning', 'Mechanistic Interpretability', 'Sparse Autoencoders'],
    climate: ['Carbon Sequestration', 'Tipping Points', 'Climate Feedback Loops', 'Geoengineering'],
    design: ['Affordance Theory', 'Systems Thinking', 'Participatory Design', 'Material Semiotics'],
    neuro: ['Predictive Coding', 'Neuroplasticity', 'Default Mode Network', 'Synaptic Pruning'],
    space: ['Orbital Mechanics', 'Dark Matter Distribution', 'Exoplanet Atmospheres', 'Solar Wind Dynamics'],
    evolution: ['Punctuated Equilibrium', 'Sexual Selection', 'Horizontal Gene Transfer', 'Niche Construction'],
  };

  // Find a matching key
  const matchKey = Object.keys(expansions).find(k => t.includes(k));
  if (matchKey) return expansions[matchKey];

  // Fallback: generic academic expansion
  const suffixes = ['Mechanisms', 'Theoretical Basis', 'Applied Research', 'Emergent Patterns', 'Open Problems', 'Historical Context'];
  const words = topic.split(' ');
  const root = words[words.length - 1] || topic;
  return suffixes.slice(0, 4).map(s => `${root} — ${s}`);
};

const generateNodeConcept = (title: string): string => {
  return `Research node exploring the structural and conceptual dimensions of "${title}". Click + to dive deeper and generate sub-hypotheses.`;
};

// ----- Node Types -----

const nodeTypes = {
  concept: ConceptNode,
  clusterZone: ClusterZone,
};

// ----- Editor Canvas -----

function EditorCanvas() {
  const [viewMode, setViewMode] = useState<'detailed' | 'overview'>('detailed');
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  // useRef avoids stale closure in handleExplore callback
  const clusterIndexRef = React.useRef(0);

  const { theme, setTheme } = useTheme();
  const { fitView, setViewport } = useReactFlow();

  /**
   * Core expand function — called when user clicks "+" on a node.
   * Generates suggestion sub-nodes and a cluster zone around them.
   * Also copies a research prompt to clipboard for chat integration.
   */
  const handleExplore = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const parentNode = nds.find(n => n.id === nodeId);
      if (!parentNode) return nds;

      const parentTitle: string = parentNode.data.title;
      const parentDepth: number = parentNode.data.depth ?? 0;
      const suggestions = expandTopic(parentTitle, parentDepth);

      // Pick cluster palette (cycle through)
      const paletteEntry = CLUSTER_PALETTE[clusterIndexRef.current % CLUSTER_PALETTE.length];
      clusterIndexRef.current += 1;
      const zoneId = `zone-${nodeId}-${Date.now()}`;

      const angleStep = (2 * Math.PI) / suggestions.length;
      const angleOffset = -Math.PI / 2; // start top
      // Decrease radius with depth: root=500, depth1=400, depth2=320...
      const spawnRadius = BASE_SPAWN_RADIUS * Math.pow(0.8, parentDepth);

      const childNodes = suggestions.map((suggestion, i) => {
        const angle = angleOffset + angleStep * i;
        return {
          id: `node-${Date.now()}-${i}`,
          type: 'concept',
          position: {
            x: parentNode.position.x + spawnRadius * Math.cos(angle),
            y: parentNode.position.y + spawnRadius * Math.sin(angle),
          },
          data: {
            title: suggestion,
            concept: generateNodeConcept(suggestion),
            trl: Math.max(1, 9 - parentDepth * 2),
            sourceReliability: parentDepth === 0 ? 'High' : parentDepth === 1 ? 'Medium' : 'Low',
            depth: parentDepth + 1,
            onExplore: handleExplore,
          },
        };
      });

      // Dynamic zone sizing: fit to actual bounding box of children
      const xs = childNodes.map(n => n.position.x);
      const ys = childNodes.map(n => n.position.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const zoneW = (maxX - minX) + ZONE_PADDING;
      const zoneH = (maxY - minY) + ZONE_PADDING;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const zoneNode = {
        id: zoneId,
        type: 'clusterZone',
        position: { x: centerX - zoneW / 2, y: centerY - zoneH / 2 },
        style: { width: zoneW, height: zoneH, zIndex: -1 },
        data: {
          label: parentTitle,
          color: paletteEntry.color,
          pattern: paletteEntry.pattern,
        },
        selectable: true,
        draggable: true,
      };

      // New edges: parent → children (map road style)
      setEdges((eds) => [
        ...eds,
        ...childNodes.map((child, i) => ({
          id: `edge-${nodeId}-${child.id}`,
          source: nodeId,
          target: child.id,
          ...MAP_EDGE_STYLE,
        })),
      ]);

      // Copy research prompt to clipboard for chat integration
      const prompt = `Researche das Thema "${parentTitle}" in der Tiefe. Leite daraus folgende Unterthemen her: ${suggestions.join(', ')}. Gib mir zu jedem eine kurze, präzise Research-Erklärung.`;
      navigator.clipboard.writeText(prompt).catch(() => {});

      return [zoneNode, ...childNodes, ...nds];
    });

    setTimeout(() => fitView({ duration: 900, padding: 0.15 }), 80);
  }, [fitView]);

  /** Start a new research topic from the input bar */
  const handleStartResearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const rootId = `root-${Date.now()}`;
    const rootNode = {
      id: rootId,
      type: 'concept',
      position: { x: 0, y: 0 },
      data: {
        title: inputValue.trim(),
        concept: `Root research node for "${inputValue.trim()}". Click + to begin exploring sub-topics.`,
        trl: 9,
        sourceReliability: 'High' as const,
        depth: 0,
        onExplore: handleExplore,
      },
    };

    setNodes([rootNode]);
    setEdges([]);
    clusterIndexRef.current = 0;
    setInputValue('');
    setTimeout(() => fitView({ duration: 800, maxZoom: 1.2 }), 100);
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(nds => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(eds => applyEdgeChanges(changes, eds)),
    []
  );

  /** Manual wire between nodes → spawns a synthesis insight node */
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => addEdge({ ...params, ...MAP_EDGE_STYLE, label: '↔' } as Edge, eds));

      setNodes(nds => {
        const src = nds.find(n => n.id === params.source);
        const tgt = nds.find(n => n.id === params.target);
        if (!src || !tgt) return nds;

        const offset = (Math.random() - 0.5) * 120;
        const insight = {
          id: `insight-${Date.now()}`,
          type: 'concept',
          position: {
            x: (src.position.x + tgt.position.x) / 2 + offset,
            y: (src.position.y + tgt.position.y) / 2 + offset,
          },
          data: {
            title: 'Synthesis Node',
            concept: `Lateral bridge between "${src.data.title}" and "${tgt.data.title}". Identifies structural gap or emergent synergy.`,
            trl: 7,
            sourceReliability: 'Medium' as const,
            depth: Math.max(src.data.depth ?? 0, tgt.data.depth ?? 0) + 1,
            onExplore: handleExplore,
          },
        };
        return [...nds, insight];
      });

      setTimeout(() => fitView({ duration: 600, padding: 0.12 }), 50);
    },
    [handleExplore, fitView]
  );

  /** Semantic zoom: update viewMode based on current zoom level */
  const handleMove = useCallback((_event: any, viewport: { zoom: number }) => {
    setViewMode(prev => {
      const next = viewport.zoom <= 0.55 ? 'overview' : 'detailed';
      return next !== prev ? next : prev;
    });
  }, []);

  const handleZoomModeClick = () => {
    if (viewMode === 'detailed') {
      setViewport({ x: 0, y: 0, zoom: 0.3 }, { duration: 800 });
    } else {
      fitView({ duration: 800, padding: 0.12 });
    }
  };

  return (
    <div className="relative w-screen h-screen font-sans overflow-hidden">
      {/* React Flow Canvas */}
      <div className="absolute inset-0 z-0">
        <ViewModeContext.Provider value={viewMode}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMove={handleMove}
            nodeTypes={nodeTypes}
            minZoom={0.05}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="dark:bg-[#080808] bg-zinc-100"
            defaultEdgeOptions={{ ...MAP_EDGE_STYLE }}
          >
            <Background color="rgba(255,255,255,0.04)" gap={32} size={1} />
          </ReactFlow>
        </ViewModeContext.Provider>
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 px-6 py-5 flex justify-between items-center z-20 pointer-events-none">
        {/* Logo */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white/70" />
          </div>
          <span className="text-sm font-semibold text-white/60 tracking-wide">Research Map</span>
        </div>

        {/* Search bar — center */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
          <form
            onSubmit={handleStartResearch}
            className="flex items-center gap-3 bg-zinc-950/70 backdrop-blur-3xl border border-white/10 rounded-full px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] focus-within:border-white/20 transition-all"
          >
            <Sparkles className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="New research topic..."
              className="bg-transparent text-white text-sm outline-none w-64 placeholder-gray-600 tracking-tight"
            />
          </form>
        </div>

        {/* Controls — right */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={handleZoomModeClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400 text-xs font-medium"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{viewMode === 'detailed' ? 'Cluster' : 'Detail'}</span>
          </button>

          <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-gray-400">
            <Save className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hint when canvas is empty */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <p className="text-gray-600 text-sm font-medium">Enter a research topic above to begin</p>
            <p className="text-gray-700 text-xs mt-1">Click + on any node to explore deeper</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
