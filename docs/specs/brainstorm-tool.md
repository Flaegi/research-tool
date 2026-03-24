# Blueprint Specification: AI Brainstorming Tool

## 1. Overview
The AI Brainstorming Tool is a local single-page web artifact designed for live ideation sessions. Embedded within the BLAST workflow, it translates conversational brainstorming into an interactive, force-directed network graph.

## 2. Aesthetics & UI
- **Design System:** "Nothing"-inspired aesthetics.
- **Palette:** Monochrome (pure white background #fafafa, dark gray/black text and strokes). Minimal accent colors if clustering is used.
- **Style:** Clean dashboard layout, dotted patterns if needed.
- **Components:** Glassmorphism (frosted glass) elements for overlays, panels, and depth indicators.

## 3. Core Features
- **Force-Directed Graph (D3.js):** Nodes repel each other, edges connect related concepts intuitively.
- **Progressive Depth (10-Dot System):** Each node displays up to 10 visual dots (glass style) indicating how deeply a topic has been explored. Clicking an empty dot triggers the AI to research further and spawn child nodes or deeper information.
- **Knowledge Loop (Quellen-Integration):** 
  - NotebookLM or other external knowledge can be loaded to seed nodes.
  - At the end of every BLAST project, key insights from the graph are exported back into NotebookLM.
- **Project Isolation:** One distinct graph per project. The graph state is stored as a structured JSON file within the project directory.

## 4. Technical Stack
- HTML5, Vanilla CSS, Vanilla JavaScript
- **D3.js:** For rendering the force layout, physics, and zoom/pan behaviors.
- **JSON Persistence:** Graph state will be managed locally.

## 5. Interaction Model
- **Drag & Drop:** Adjust node positions freely.
- **Zoom & Pan:** Navigate the canvas smoothly.
- **Click Node:** Opens a glassmorphism side-panel detailing the generated idea.
- **Click Depth Dot:** Expanding a topic directly prompts the AI to increase the depth of the graph branching from that node.
