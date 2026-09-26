import { memo, useMemo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { 
  Box, 
  Database, 
  Globe, 
  Webhook, 
  Shield, 
  ShieldCheck, 
  FileText, 
  ListChecks, 
  Code,
  FolderKanban,
  FileCode,
  Layers,
  Server,
  GitBranch,
  Filter,
  Cpu,
  Wrench,
  Table2,
  TableProperties,
  Bot,
  MoreHorizontal,
  LucideIcon
} from "lucide-react";

// Icon mapping from string names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  FolderKanban,
  FileCode,
  Box,
  Database,
  Globe,
  Webhook,
  Shield,
  ShieldCheck,
  FileText,
  ListChecks,
  Code,
  Layers,
  Server,
  GitBranch,
  Filter,
  Cpu,
  Wrench,
  Table2,
  TableProperties,
  Bot,
  MoreHorizontal,
};

// Legacy fallback icons (for backward compatibility)
const legacyNodeIcons: Record<string, LucideIcon> = {
  PROJECT: FolderKanban,
  PAGE: FileCode,
  COMPONENT: Box,
  WEB_COMPONENT: Box,
  HOOK_COMPOSABLE: Layers,
  API: Code,
  API_SERVICE: Server,
  API_ROUTER: GitBranch,
  API_MIDDLEWARE: Filter,
  API_CONTROLLER: Cpu,
  API_UTIL: Wrench,
  DATABASE: Database,
  SCHEMA: TableProperties,
  TABLE: Table2,
  SERVICE: Globe,
  EXTERNAL_SERVICE: Globe,
  WEBHOOK: Webhook,
  FIREWALL: Shield,
  SECURITY: ShieldCheck,
  REQUIREMENT: FileText,
  STANDARD: ListChecks,
  TECH_STACK: Code,
  AGENT: Bot,
  OTHER: MoreHorizontal,
};

// Legacy fallback colors (for backward compatibility)
const legacyNodeColors: Record<string, string> = {
  PROJECT: "bg-design/10 border-design/50 text-design",
  PAGE: "bg-design/10 border-design/50 text-design",
  COMPONENT: "bg-primary/10 border-primary/50 text-primary",
  WEB_COMPONENT: "bg-primary/10 border-primary/50 text-primary",
  HOOK_COMPOSABLE: "bg-define/10 border-define/50 text-define",
  API: "bg-ok/10 border-ok/50 text-ok",
  API_SERVICE: "bg-ok/10 border-ok/50 text-ok",
  API_ROUTER: "bg-ok/10 border-ok/50 text-ok",
  API_MIDDLEWARE: "bg-warn/10 border-warn/50 text-warn",
  API_CONTROLLER: "bg-ok/10 border-ok/50 text-ok",
  API_UTIL: "bg-surface-2/10 border-line-2/50 text-foreground dark:text-muted-foreground",
  DATABASE: "bg-define/10 border-define/50 text-define",
  SCHEMA: "bg-define/10 border-define/50 text-define",
  TABLE: "bg-bad/10 border-bad/50 text-bad",
  SERVICE: "bg-warn/10 border-warn/50 text-warn",
  EXTERNAL_SERVICE: "bg-warn/10 border-warn/50 text-warn",
  WEBHOOK: "bg-bad/10 border-bad/50 text-bad",
  FIREWALL: "bg-bad/10 border-bad/50 text-bad",
  SECURITY: "bg-warn/10 border-warn/50 text-warn",
  REQUIREMENT: "bg-primary/10 border-primary/50 text-primary",
  STANDARD: "bg-design/10 border-design/50 text-design",
  TECH_STACK: "bg-surface-2/10 border-line-2/50 text-foreground dark:text-muted-foreground",
  AGENT: "bg-design/10 border-design/50 text-design",
  OTHER: "bg-surface-2/10 border-line-2/50 text-foreground dark:text-muted-foreground",
};

interface CanvasNodeProps extends NodeProps {
  nodeTypesConfig?: {
    icon?: string;
    color_class?: string;
  };
}

export const CanvasNode = memo(({ data, selected }: CanvasNodeProps) => {
  const nodeType = data.type as string || "COMPONENT";
  
  // Get icon - try from data config first, then fallback
  const Icon = useMemo(() => {
    if (data.iconName && iconMap[data.iconName]) {
      return iconMap[data.iconName];
    }
    return legacyNodeIcons[nodeType] || Box;
  }, [nodeType, data.iconName]);
  
  // Get color class - try from data config first, then fallback
  const colorClass = useMemo(() => {
    if (data.colorClass) {
      return data.colorClass;
    }
    return legacyNodeColors[nodeType] || legacyNodeColors.OTHER;
  }, [nodeType, data.colorClass]);

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[180px]
        ${colorClass}
        ${selected ? "ring-2 ring-primary ring-offset-2" : ""}
        transition-all duration-200
      `}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3" />
      
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{data.label || "New Node"}</div>
          {data.subtitle && (
            <div className="text-xs opacity-70 mt-0.5 break-words whitespace-pre-wrap max-w-[200px]">
              {data.subtitle.length > 200 
                ? data.subtitle.slice(0, 200) + "..." 
                : data.subtitle}
            </div>
          )}
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} className="w-3 h-3" />
    </div>
  );
});

CanvasNode.displayName = "CanvasNode";
