import { memo, useState, useCallback, useEffect } from "react";
import { NodeProps, NodeResizer, useReactFlow, Handle, Position } from "reactflow";
import { Input } from "@/components/ui/input";

interface ZoneNodeData {
  label?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  backgroundColor?: string;
  type?: string;
  nodeType?: string;
  style?: { width?: number; height?: number };
}

const zoneColorClasses: Record<string, string> = {
  blue: "bg-primary-soft/60 dark:bg-primary/40 border-primary-soft dark:border-primary",
  green: "bg-ok-soft/60 dark:bg-ok/40 border-ok-soft dark:border-ok",
  yellow: "bg-warn-soft/60 dark:bg-warn/40 border-warn-soft dark:border-warn",
  red: "bg-bad-soft/60 dark:bg-bad/40 border-bad-soft dark:border-bad",
  purple: "bg-define/60 dark:bg-define/40 border-define",
  gray: "bg-surface-2/60 dark:bg-surface-2/40 border-line dark:border-line-2",
  orange: "bg-warn-soft/60 dark:bg-warn/40 border-warn-soft dark:border-warn",
  cyan: "bg-design/60 dark:bg-design/40 border-design",
};

const zoneTitleClasses: Record<string, string> = {
  blue: "bg-primary-soft/80 dark:bg-primary/60 text-primary dark:text-primary-soft",
  green: "bg-ok-soft/80 dark:bg-ok/60 text-ok dark:text-ok-soft",
  yellow: "bg-warn-soft/80 dark:bg-warn/60 text-warn dark:text-warn-soft",
  red: "bg-bad-soft/80 dark:bg-bad/60 text-bad dark:text-bad-soft",
  purple: "bg-define/80 dark:bg-define/60 text-define",
  gray: "bg-surface-2/80 dark:bg-surface-2/60 text-foreground dark:text-muted-foreground",
  orange: "bg-warn-soft/80 dark:bg-warn/60 text-warn dark:text-warn-soft",
  cyan: "bg-design/80 dark:bg-design/60 text-design",
};

export const ZoneNode = memo(({ data, selected, id }: NodeProps<ZoneNodeData>) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(data.title || data.label || "Zone");
  const { setNodes } = useReactFlow();

  const backgroundColor = data.backgroundColor || "gray";
  const colorClass = zoneColorClasses[backgroundColor] || zoneColorClasses.gray;
  const titleClass = zoneTitleClasses[backgroundColor] || zoneTitleClasses.gray;

  // Sync title with data prop
  useEffect(() => {
    setTitle(data.title || data.label || "Zone");
  }, [data.title, data.label]);

  const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
  }, []);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    // Update node data when done editing
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, title, label: title } }
          : node
      )
    );
  }, [id, title, setNodes]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") {
      setIsEditingTitle(false);
      // Update node data when exiting
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, title, label: title } }
            : node
        )
      );
    }
  }, [id, title, setNodes]);

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        lineClassName="border-primary"
        handleClassName="bg-primary border-2 border-background rounded"
        handleStyle={{ width: 40, height: 40 }}
      />
      
      {/* Connection Handles */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-primary" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
      
      <div 
        className={`h-full w-full rounded-lg border-2 border-dashed ${colorClass} shadow-sm flex flex-col`}
      >
        <div 
          className={`px-3 py-1.5 rounded-t-md ${titleClass} cursor-move`}
          onDoubleClick={handleTitleDoubleClick}
        >
          {isEditingTitle ? (
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="h-6 px-1 text-sm font-semibold bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔲</span>
                <span className="text-sm font-semibold">{title}</span>
              </div>
              {data.subtitle && (
                <div className="text-xs opacity-70 pl-6 truncate">
                  {data.subtitle}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-1" />
      </div>
    </>
  );
});

ZoneNode.displayName = "ZoneNode";

export { zoneColorClasses, zoneTitleClasses };
