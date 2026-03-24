// --- State & Data Persistence ---
const DEFAULT_DATA = {
  nodes: [
    { id: 'root', title: 'Main Concept', depth: 2, maxDepth: 10, notes: 'The starting point of our brainstorm.' }
  ],
  links: []
};

let graphData = { ...DEFAULT_DATA };
let currentSelectedNode = null;

// --- D3 Engine Setup ---
const container = document.getElementById('graph-container');
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select('#graph-container')
  .append('svg')
  .attr('width', width)
  .attr('height', height);

// Add zoom & pan
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on('zoom', (e) => g.attr('transform', e.transform));
svg.call(zoom);

// The main group containing all graph elements
const g = svg.append('g');

// Force simulation
const simulation = d3.forceSimulation()
  .force('link', d3.forceLink().id(d => d.id).distance(180))
  .force('charge', d3.forceManyBody().strength(-800))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(80)); // Prevents nodes from overlapping

// Groups for data binding
const linkGroup = g.append('g').attr('class', 'links');
const nodeGroup = g.append('g').attr('class', 'nodes');

// --- Main Render Function ---
function updateGraph() {
  // Update Links
  const linkSelection = linkGroup.selectAll('.link')
    .data(graphData.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
    
  linkSelection.exit().remove();
  
  const linkEnter = linkSelection.enter()
    .append('line')
    .attr('class', 'link');

  const links = linkEnter.merge(linkSelection);

  // Update Nodes
  const nodeSelection = nodeGroup.selectAll('.node-group')
    .data(graphData.nodes, d => d.id);
    
  nodeSelection.exit().remove();
  
  const nodeEnter = nodeSelection.enter()
    .append('g')
    .attr('class', 'node-group')
    .on('click', handleNodeClick)
    .call(drag(simulation));

  // 1. Draw connecting lines to depth dots (optional visual flair)
  // We'll skip lines to dots to keep it clean, dots will orbit directly.

  // 2. Main Circle
  nodeEnter.append('circle')
    .attr('class', 'node-main')
    .attr('r', 40);

  // 3. Node Label
  nodeEnter.append('text')
    .attr('class', 'node-text')
    .attr('y', 60)
    .attr('text-anchor', 'middle')
    .text(d => d.title);

  const nodes = nodeEnter.merge(nodeSelection);

  // 4. Render/Update Depth Dots (The Core Mechanic)
  nodes.each(function(d) {
    const parent = d3.select(this);
    const radius = 40;
    const dotDistance = radius + 12; // Orbit distance
    const totalDots = d.maxDepth || 10;
    
    // Select existing dots or create new ones
    let dots = parent.selectAll('.depth-dot').data(d3.range(totalDots));
    
    dots.enter()
      .append('circle')
      .merge(dots)
      .attr('class', (i) => i < d.depth ? 'depth-dot filled' : 'depth-dot')
      .attr('r', 5)
      .attr('cx', (i) => Math.cos(-Math.PI/2 + (i - (totalDots-1)/2) * (Math.PI / (totalDots - 1))) * dotDistance)
      .attr('cy', (i) => Math.sin(-Math.PI/2 + (i - (totalDots-1)/2) * (Math.PI / (totalDots - 1))) * dotDistance)
      .on('click', function(event, i) {
        event.stopPropagation(); // Don't trigger node click
        handleDepthClick(d, i, this);
      });
  });

  // Restart Simulation
  simulation.nodes(graphData.nodes).on('tick', ticked);
  simulation.force('link').links(graphData.links);
  simulation.alpha(1).restart();

  function ticked() {
    links
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodes
      .attr('transform', d => `translate(${d.x},${d.y})`);
  }
}

// --- Interactions ---
function handleNodeClick(event, d) {
  currentSelectedNode = d;
  
  // Update Panel UI
  document.getElementById('panel-title').innerText = d.title;
  document.getElementById('depth-value').innerText = d.depth;
  document.getElementById('panel-notes').value = d.notes || '';
  
  document.getElementById('side-panel').classList.remove('hidden');
}

document.getElementById('btn-close-panel').addEventListener('click', () => {
  document.getElementById('side-panel').classList.add('hidden');
  currentSelectedNode = null;
});

document.getElementById('panel-notes').addEventListener('input', (e) => {
  if (currentSelectedNode) currentSelectedNode.notes = e.target.value;
});

function handleDepthClick(node, dotIndex, el) {
  // Only allow progressing depth upwards sequentially
  if (dotIndex === node.depth) {
    // Show loading state temporarily
    d3.select(el).classed('loading', true);
    
    console.log(`AI Trigger: Generate deeper insights for [${node.title}]`);
    
    // Simulate AI delay
    setTimeout(() => {
      node.depth += 1;
      
      // Optionally spawn a child node here based on the deep dive
      const newId = `node-${Date.now()}`;
      graphData.nodes.push({
        id: newId,
        title: `Deep Dive ${node.depth}: ${node.title}`,
        depth: 1,
        maxDepth: 10,
        notes: ''
      });
      graphData.links.push({ source: node.id, target: newId });
      
      updateGraph();
    }, 800);
  }
}

function drag(simulation) {
  return d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
}

// --- UI Controls ---
document.getElementById('btn-add-node').addEventListener('click', () => {
  const newId = `node-${Date.now()}`;
  graphData.nodes.push({ id: newId, title: 'New Concept', depth: 0, maxDepth: 10, notes: '' });
  
  // Connect to currently selected, or root if none
  const targetId = currentSelectedNode ? currentSelectedNode.id : graphData.nodes[0].id;
  graphData.links.push({ source: newId, target: targetId });
  
  updateGraph();
});

document.getElementById('btn-export').addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graphData, null, 2));
  const el = document.createElement('a');
  el.setAttribute("href", dataStr);
  el.setAttribute("download", "brainstorm-session.json");
  document.body.appendChild(el);
  el.click();
  el.remove();
});

// Handle resize
window.addEventListener('resize', () => {
  svg.attr('width', window.innerWidth).attr('height', window.innerHeight);
  simulation.force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));
  simulation.alpha(0.3).restart();
});

// Initial Render
updateGraph();
