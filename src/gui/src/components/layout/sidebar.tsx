import { cn } from "@/lib/utils";
import {
  Zap,
  History,
  Cpu,
  Settings,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}

function SidebarItem({ icon: Icon, label, active, onClick, collapsed = false }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex min-w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all lg:w-full lg:gap-3",
        collapsed && "lg:justify-center lg:px-0",
        active
          ? "bg-brand/10 text-brand"
          : "text-muted-foreground hover:bg-zinc-900 hover:text-zinc-100"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={cn(collapsed && "lg:hidden")}>{label}</span>
    </button>
  );
}

interface SidebarProps {
  activeTab: string;
  collapsed: boolean;
  onTabChange: (tab: string) => void;
  onToggleCollapsed: () => void;
}

export function Sidebar({ activeTab, collapsed, onTabChange, onToggleCollapsed }: SidebarProps) {
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-b border-zinc-800 bg-background/60 backdrop-blur-xl transition-[width] duration-200 lg:h-screen lg:border-b-0 lg:border-r",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}
    >
      <div className={cn("flex h-14 items-center gap-3 border-b border-zinc-800 px-4 lg:px-4", collapsed && "lg:justify-center lg:px-0")}>
        <img src="/logo.png" className="h-6 w-6 shrink-0 object-contain" alt="Logo" />
        <span className={cn("text-lg font-bold tracking-tight", collapsed && "lg:hidden")}>CorridorKey</span>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
          className={cn(
            "ml-auto hidden h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100 lg:flex",
            collapsed && "lg:ml-0"
          )}
        >
          <CollapseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto px-3 py-2 lg:block lg:flex-1 lg:space-y-1 lg:px-4 lg:py-6">
        <SidebarItem icon={Zap} label="Workflow" active={activeTab === "Workflow"} onClick={() => onTabChange("Workflow")} collapsed={collapsed} />
        <SidebarItem icon={History} label="History" active={activeTab === "History"} onClick={() => onTabChange("History")} collapsed={collapsed} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-zinc-800 px-3 py-2 lg:mt-auto lg:block lg:space-y-1 lg:px-4 lg:py-6">
        <SidebarItem icon={Cpu} label="Hardware" active={activeTab === "Hardware"} onClick={() => onTabChange("Hardware")} collapsed={collapsed} />
        <SidebarItem icon={Settings} label="Settings" active={activeTab === "Settings"} onClick={() => onTabChange("Settings")} collapsed={collapsed} />
        <SidebarItem icon={HelpCircle} label="Support" active={activeTab === "Support"} onClick={() => onTabChange("Support")} collapsed={collapsed} />
      </div>
    </aside>
  );
}
