import { useState } from 'react';
import { FlameGraph } from 'react-flame-graph';
import { parseProfilerForFlameGraph, FlameGraphNode } from './parser';

const inputStyle = {
  border: '1px solid #ccc',
  borderRadius: 4,
  padding: '8px 12px',
  width: '100%',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 8,
};
const Input = (props) => <input {...props} style={inputStyle} />;

export default function App() {
  const [profiles, setProfiles] = useState<[FlameGraphNode | null, FlameGraphNode | null]>([null, null]);

  const handleFileUpload = async (index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const parsed = parseProfilerForFlameGraph(json);
      const newProfiles = [...profiles] as [FlameGraphNode | null, FlameGraphNode | null];
      // parsed is an array; pick the root node or null if empty
      newProfiles[index] = parsed.length > 0 ? parsed[0] : null;
      setProfiles(newProfiles);
    } catch {
      const newProfiles = [...profiles] as [FlameGraphNode | null, FlameGraphNode | null];
      newProfiles[index] = null;
      setProfiles(newProfiles);
    }
  };

  // Calculate the max depth of the loaded flame graph for dynamic height
  function getMaxDepth(node: FlameGraphNode | null): number {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) return 1;
    return 1 + Math.max(...node.children.map(getMaxDepth));
  }

  // Find the max depth among both profiles
  const maxDepth = Math.max(getMaxDepth(profiles[0]), getMaxDepth(profiles[1]));
  // Each row is about 24px high in react-flame-graph
  const flameGraphHeight = Math.max(200, maxDepth * 28 + 40); // 28 for padding, 40 for header

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        padding: 0,
        background: '#fff',
        marginLeft: 32,
        marginTop: 32,
      }}
    >
      <h1
        style={{
          fontSize: '2.2rem',
          fontWeight: 700,
          marginLeft: 16,
          marginBottom: 24,
          marginTop: 0,
          color: '#213547',
        }}
      >
        React Profiler Comparison
      </h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          width: '100%',
        }}
      >
        {[0, 1].map((i) => (
          <div key={i} style={{ marginRight: 16, flex: 1 }}>
            <Input type='file' accept='application/json' onChange={(e) => handleFileUpload(i, e)} />
            {profiles[i] && (
              <FlameGraph
                data={profiles[i]}
                height={flameGraphHeight}
                width={800}
                onChange={(node) => {
                  console.log(`"${node.name}" focused`);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
