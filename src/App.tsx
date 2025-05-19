import { useState } from 'react';
import { FlameGraph } from 'react-flame-graph';
import { parseProfilerForFlameGraph, FlameGraphNode } from './parser';

const Input = (props) => <input {...props} className='border rounded px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500' />;

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

  // Calculate the max depth of the loaded flamegraph for dynamic height
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
    <div className="min-h-screen flex flex-col items-stretch justify-start p-0 m-0 bg-white">
      <h1 className='text-2xl font-bold mb-4 mt-4 ml-6'>React Profiler Comparison</h1>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 w-full'>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }} className='mt-0'>
          {[0, 1].map((i) => (
            <div key={i} className="mr-4">
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
    </div>
  );
}
