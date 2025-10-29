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

  // Build a map from both base and memoized names to durations
  const nameToDurations: Record<string, number[]> = {};
  if (Array.isArray(json.timelineData)) {
    for (const timeline of json.timelineData) {
      if (Array.isArray(timeline.componentMeasures)) {
        for (const measure of timeline.componentMeasures) {
          if (measure.componentName) {
            const { base, isMemo } = parseMemo(measure.componentName);
            // Store under base name
            if (!nameToDurations[base]) {
              nameToDurations[base] = [];
            }
            nameToDurations[base].push(measure.duration);
            // Also store under base + ' (Memo)' if memoized
            if (isMemo) {
              const memoName = base + ' (Memo)';
              if (!nameToDurations[memoName]) {
                nameToDurations[memoName] = [];
              }
              nameToDurations[memoName].push(measure.duration);
            }
          }
        }
      }
    }
  }

  // Helper to recursively build FlameGraphNode from snapshot id
  function buildNode(id: number, snapshots: Snapshots): FlameGraphNode {
    const node = snapshots[id];
    if (!node) {
      return { name: 'Unknown', value: 0 };
    }
    let children: FlameGraphNode[] | undefined = undefined;
    let value = 1;
    if (node.children && node.children.length > 0) {
      children = node.children.map((childId) => buildNode(childId, snapshots));
      value = children.reduce((sum, child) => sum + child.value, 0);
    }

    // Find the first matching duration for this node's displayName (handle Memo)
    let displayName = node.displayName || 'Unknown';
    const { base, isMemo } = parseMemo(displayName);
    let nameWithDuration = base;
    if (isMemo) {
      nameWithDuration += ' (Memo)';
    }
    let backgroundColor: string | undefined = undefined;
    let tooltip = `id: ${node.id}`;
    // Try both base and base + ' (Memo)' for duration lookup
    let durationArr = nameToDurations[nameWithDuration] && nameToDurations[nameWithDuration].length > 0 ? nameToDurations[nameWithDuration] : nameToDurations[base] && nameToDurations[base].length > 0 ? nameToDurations[base] : undefined;
    if (durationArr) {
      const duration = durationArr.shift();
      if (typeof duration === 'number') {
        if (duration === 0) {
          nameWithDuration += ' (<0.1ms)';
        } else {
          nameWithDuration += ` (${duration.toFixed(2)}ms)`;
        }
      }
    } else {
      // Node did not rerender, set grey background color and tooltip
      backgroundColor = '#bbb';
      tooltip = 'Client did not rerender';
    }

    return {
      name: nameWithDuration,
      value,
      tooltip,
      backgroundColor,
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
    // Use the node with displayName === 'App' as the root, fallback to smallest id if not found
    let rootId = snapshotIds[0];
    for (const id of snapshotIds) {
      if (snapshots[id].displayName === 'App') {
        rootId = id;
        break;
      }
    }
    result.push(buildNode(rootId, snapshots));
  }

  // Log the result for debugging
  // eslint-disable-next-line no-console
  // console.log('FlameGraphNode result:', JSON.stringify(result, null, 2));
  return result;
}