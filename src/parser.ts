export type FlameGraphNode = {
  name: string;
  value: number;
  children?: FlameGraphNode[];
  tooltip?: string;
  backgroundColor?: string;
  color?: string;
};

type TimelineData = {
  batchUIDToMeasuresKeyValueArray: [
    number,
    Array<{
      type: string;
      batchUID: number;
      depth: number;
      lanes: number[];
      timestamp: number;
      duration: number;
    }>
  ][];
  componentMeasures: Array<{
    componentName: string;
    duration: number;
    timestamp: number;
    type: string;
    warning: string | null;
  }>;
  duration: number;
  flamechart: any[];
  internalModuleSourceToRanges: any[];
  laneToLabelKeyValueArray: [number, string | null][];
  laneToReactMeasureKeyValueArray: [number, any[]][];
  nativeEvents: any[];
  networkMeasures: any[];
  otherUserTimingMarks: any[];
  reactVersion: string;
  schedulingEvents: Array<{
    componentName: string;
    lanes: number[];
    timestamp: number;
    type: string;
    warning: string | null;
    componentStack: string;
  }>;
  snapshots: any[];
  snapshotHeight: number;
  startTime: number;
  suspenseEvents: any[];
  thrownErrors: any[];
};

type ProfilerJSON = {
  version: number;
  dataForRoots: RootData[];
  timelineData: TimelineData[];
};

type RootData = {
  rootID: number;
  displayName: string;
  commitData: CommitData[];
  initialTreeBaseDurations: number[][];
  operations: number[][];
  snapshots: Snapshots;
};

// Snapshots can be either an array of [id, node] tuples or an object keyed by id in the input,
// but we always normalize to Record<number, SnapshotNode> in the function logic.
type SnapshotNode = {
  id: number;
  children: number[];
  displayName: string | null;
  hocDisplayNames: string[] | null;
  key: string | null;
  type: number;
  compiledWithForget: boolean;
};
type Snapshots = Record<number, SnapshotNode>;

type CommitData = {
  [key: string]: any;
};


export function parseProfilerForFlameGraph(json: ProfilerJSON): FlameGraphNode[] {
  const result: FlameGraphNode[] = [];

  // Helper to parse Memo wrapper
  function parseMemo(name: string): { base: string; isMemo: boolean } {
    const memoMatch = name.match(/^Memo\((.+)\)$/);
    if (memoMatch) {
      return { base: memoMatch[1], isMemo: true };
    }
    return { base: name, isMemo: false };
  }

  // Build a comprehensive map of component render durations
  const componentDurations: Record<string, number[]> = {};
  const componentTotalDurations: Record<string, number[]> = {};

  if (Array.isArray(json.timelineData)) {
    for (const timeline of json.timelineData) {
      if (Array.isArray(timeline.componentMeasures)) {
        for (const measure of timeline.componentMeasures) {
          if (measure.componentName && measure.type === 'render') {
            const { base, isMemo } = parseMemo(measure.componentName);
            const componentName = isMemo ? `${base} (Memo)` : base;

            if (!componentDurations[componentName]) {
              componentDurations[componentName] = [];
            }
            componentDurations[componentName].push(measure.duration);
          }
        }
      }
    }
  }

  // Get fiber actual durations from commit data for more accurate timing
  for (const root of json.dataForRoots) {
    if (Array.isArray(root.commitData)) {
      for (const commit of root.commitData) {
        if (Array.isArray(commit.fiberActualDurations)) {
          for (const [fiberId, duration] of commit.fiberActualDurations) {
            // Map fiber IDs to component names through snapshots
            let snapshots: Snapshots;
            if (Array.isArray((root as any).snapshots)) {
              snapshots = Object.fromEntries((root as any).snapshots);
            } else {
              snapshots = root.snapshots as Snapshots;
            }

            const node = snapshots[fiberId];
            if (node && node.displayName) {
              const { base, isMemo } = parseMemo(node.displayName);
              const componentName = isMemo ? `${base} (Memo)` : base;

              if (!componentTotalDurations[componentName]) {
                componentTotalDurations[componentName] = [];
              }
              componentTotalDurations[componentName].push(duration);
            }
          }
        }
      }
    }
  }

  // Helper to recursively build FlameGraphNode from snapshot id
  function buildNode(id: number, snapshots: Snapshots, parentDuration?: number): FlameGraphNode {
    const node = snapshots[id];
    if (!node) {
      return { name: 'Unknown', value: 1 };
    }

    let displayName = node.displayName || (node.type === 11 ? 'Fragment' : 'Unknown');

    // Skip Fragment nodes and unwrap to children
    if (node.type === 11 && node.children && node.children.length === 1) {
      return buildNode(node.children[0], snapshots, parentDuration);
    }

    const { base, isMemo } = parseMemo(displayName);
    let componentName = isMemo ? `${base} (Memo)` : base;

    // Build children first to calculate proper value
    let children: FlameGraphNode[] | undefined = undefined;
    let totalChildValue = 0;

    if (node.children && node.children.length > 0) {
      children = node.children.map((childId) => buildNode(childId, snapshots));
      totalChildValue = children.reduce((sum, child) => sum + child.value, 0);
    }

    // Get duration for this component
    let duration: number | undefined;
    let actualDuration: number | undefined;

    // First try to get actual duration from fiber data
    if (componentTotalDurations[componentName] && componentTotalDurations[componentName].length > 0) {
      actualDuration = componentTotalDurations[componentName].shift();
    }

    // Then try component measures
    if (componentDurations[componentName] && componentDurations[componentName].length > 0) {
      duration = componentDurations[componentName].shift();
    }

    // Use the more accurate duration
    const finalDuration = actualDuration !== undefined ? actualDuration : duration;

    // Calculate value based on duration or default to child count + 1
    let value = Math.max(1, totalChildValue);
    if (finalDuration !== undefined && finalDuration > 0) {
      // Scale value based on duration (multiply by 10 to make differences more visible)
      value = Math.max(1, Math.round(finalDuration * 10));
    }

    // Format name with duration
    let nameWithDuration = componentName;
    let backgroundColor: string | undefined = undefined;
    let color: string | undefined = undefined;
    let tooltip = `Component: ${componentName}`;

    if (finalDuration !== undefined) {
      if (finalDuration === 0) {
        nameWithDuration += ' (<0.1ms)';
        backgroundColor = '#22c55e'; // Bright green for very fast renders
        color = '#ffffff';
      } else if (finalDuration < 0.5) {
        nameWithDuration += ` (${finalDuration.toFixed(1)}ms)`;
        backgroundColor = '#84cc16'; // Lime green for fast renders
        color = '#ffffff';
      } else if (finalDuration < 2) {
        nameWithDuration += ` (${finalDuration.toFixed(1)}ms)`;
        backgroundColor = '#eab308'; // Bright yellow for moderate renders
        color = '#000000';
      } else if (finalDuration < 5) {
        nameWithDuration += ` (${finalDuration.toFixed(1)}ms)`;
        backgroundColor = '#f97316'; // Orange for slower renders
        color = '#ffffff';
      } else {
        nameWithDuration += ` (${finalDuration.toFixed(1)}ms)`;
        backgroundColor = '#ef4444'; // Bright red for slow renders
        color = '#ffffff';
      }
      tooltip += `\nRender time: ${finalDuration.toFixed(2)}ms`;
    } else {
      // Component didn't rerender
      backgroundColor = '#9ca3af';
      color = '#ffffff';
      tooltip += '\nDid not rerender';
    }

    return {
      name: nameWithDuration,
      value,
      tooltip,
      backgroundColor,
      color,
      children,
    };
  }

  for (const root of json.dataForRoots) {
    // Normalize snapshots to an object keyed by id
    let snapshots: Snapshots;
    if (Array.isArray((root as any).snapshots)) {
      snapshots = Object.fromEntries((root as any).snapshots);
    } else {
      snapshots = root.snapshots as Snapshots;
    }

    const snapshotIds = Object.keys(snapshots).map(Number);
    if (snapshotIds.length === 0) continue;

    // Find the actual root component (usually has displayName and is at the top)
    let rootId = snapshotIds[0];
    for (const id of snapshotIds) {
      const node = snapshots[id];
      if (node && node.displayName && (node.displayName.includes('Router') || node.displayName === 'App')) {
        rootId = id;
        break;
      }
    }

    // If we still don't have a good root, use the first node with a displayName
    if (!snapshots[rootId].displayName) {
      for (const id of snapshotIds) {
        if (snapshots[id].displayName) {
          rootId = id;
          break;
        }
      }
    }

    result.push(buildNode(rootId, snapshots));
  }

  return result;
}