import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Workspace } from '@wrike-clone/shared';
import { clsx } from 'clsx';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useWorkspaces } from '../api/workspaces';
import { QuickTaskModal } from '../components/Task/QuickTaskModal';
import {
  canCreateQuickTask,
  creatableQuickTaskDepartments,
  resolveQuickTaskInitialDepartmentId,
} from '../components/Task/quick-task-form';
import { Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import {
  navigationForRole,
  type NavigationItem,
  type ShellRole,
} from '../design/navigation';

export interface AppShellProps {
  helpContent?: ReactNode;
}

interface AccountUser {
  displayName?: string | null;
  email?: string | null;
}

interface PrimaryNavigationProps {
  activeDepartmentId?: string;
  currentHash: string;
  currentPath: string;
  items: NavigationItem[];
  onNavigate?: () => void;
  workspaces: Workspace[];
}

interface MobileNavigationSheetProps extends PrimaryNavigationProps {
  onClose: () => void;
  open: boolean;
}

const iconPaths: Record<NavigationItem['icon'], string> = {
  admin:
    'M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Zm7.5-3.75a7.7 7.7 0 0 0-.12-1.35l1.62-1.26-1.8-3.12-1.95.78a7.56 7.56 0 0 0-2.34-1.35L14.61 3h-3.6l-.3 2.7a7.56 7.56 0 0 0-2.34 1.35l-1.95-.78-1.8 3.12 1.62 1.26A7.7 7.7 0 0 0 6.12 12c0 .46.04.91.12 1.35l-1.62 1.26 1.8 3.12 1.95-.78a7.56 7.56 0 0 0 2.34 1.35l.3 2.7h3.6l.3-2.7a7.56 7.56 0 0 0 2.34-1.35l1.95.78 1.8-3.12-1.62-1.26c.08-.44.12-.89.12-1.35Z',
  dashboard:
    'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  department:
    'M4 20V7l8-3 8 3v13M8 10h2m4 0h2m-8 4h2m4 0h2M9 20v-3h6v3',
  reports: 'M5 20V10h3v10H5Zm6 0V4h3v16h-3Zm6 0v-7h3v7h-3Z',
  tasks: 'm5 12 3 3L19 6M5 6h6M5 20h14',
};

const sectionLabels: Record<NavigationItem['section'], string> = {
  manage: 'Manage',
  overview: 'Overview',
  workspace: 'Workspace',
};

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const update = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoint]);

  return mobile;
}

function shellRoleFor(
  tenantRole: string | undefined,
  workspaces: Array<Pick<Workspace, 'departmentRole'>>,
): ShellRole {
  if (tenantRole === 'admin') return 'admin';
  if (tenantRole === 'department_head') return 'department_head';
  if (tenantRole === 'manager') return 'manager';
  if (workspaces.some(({ departmentRole }) => departmentRole === 'department_head')) {
    return 'department_head';
  }
  if (
    workspaces.some(
      ({ departmentRole }) => departmentRole === 'admin' || departmentRole === 'manager',
    )
  ) {
    return 'manager';
  }
  return 'employee';
}

function NavigationIcon({ icon }: { icon: NavigationItem['icon'] }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[icon]} />
    </svg>
  );
}

function PrimaryNavigation({
  activeDepartmentId,
  currentHash,
  currentPath,
  items,
  onNavigate,
  workspaces,
}: PrimaryNavigationProps) {
  const activeDepartment = workspaces.find(({ id }) => id === activeDepartmentId);
  const itemIsActive = (item: NavigationItem) => {
    const [path, hash] = item.path.split('#');
    return currentPath === path && (hash ? currentHash === `#${hash}` : currentHash === '');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-5">
        {(['overview', 'workspace', 'manage'] as const).map((section) => {
          const sectionItems = items.filter((item) => item.section === section);
          if (sectionItems.length === 0) return null;

          return (
            <div className="mb-6" key={section}>
              <p className="px-3 font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-atlas-current">
                {sectionLabels[section]}
              </p>
              <div className="mt-2 space-y-1">
                {sectionItems.map((item) => (
                  <Link
                    aria-current={itemIsActive(item) ? 'page' : undefined}
                    className={clsx(
                      'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current',
                      itemIsActive(item)
                        ? 'bg-atlas-mist text-atlas-canopy'
                        : 'text-atlas-ink hover:bg-atlas-paper',
                    )}
                    key={item.path}
                    onClick={onNavigate}
                    to={item.path}
                  >
                    <NavigationIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>

              {section === 'workspace' && workspaces.length > 0 && (
                <div className="mt-3 border-l border-atlas-mist pl-3">
                  <p className="px-3 font-atlasMono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-atlas-current">
                    Departments
                  </p>
                  <div className="mt-1 space-y-1">
                    {workspaces.map((workspace) => (
                      <Link
                        aria-current={workspace.id === activeDepartmentId ? 'page' : undefined}
                        className={clsx(
                          'flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current',
                          workspace.id === activeDepartmentId
                            ? 'bg-atlas-paper font-semibold text-atlas-canopy'
                            : 'text-atlas-ink hover:bg-atlas-paper',
                        )}
                        key={workspace.id}
                        onClick={onNavigate}
                        to={`/workspaces/${workspace.id}`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-atlas-mist font-atlasDisplay text-xs font-bold text-atlas-canopy"
                        >
                          {workspace.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{workspace.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <footer className="border-t border-atlas-mist bg-atlas-paper px-5 py-4">
        <p className="font-atlasMono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-atlas-current">
          Active department
        </p>
        <p className="mt-1 truncate font-atlasDisplay text-sm font-semibold text-atlas-ink">
          {activeDepartment?.name || 'All departments'}
        </p>
      </footer>
    </div>
  );
}

function AccountMenu({
  onLogout,
  user,
}: {
  onLogout: () => void;
  user: AccountUser | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const label = user?.displayName || user?.email || 'Account';

  return (
    <div className="relative">
      <button
        aria-controls="account-disclosure"
        aria-expanded={open}
        aria-label="Open account menu"
        className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-atlas-ink transition-colors hover:bg-atlas-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-atlas-canopy font-atlasDisplay text-xs font-bold text-white">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:block">{label}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <>
          <button
            aria-label="Close account menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div
            className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-atlas-mist bg-white shadow-xl"
            id="account-disclosure"
          >
            <div className="border-b border-atlas-mist px-4 py-3">
              <p className="truncate font-atlasDisplay text-sm font-semibold text-atlas-ink">
                {label}
              </p>
              {user?.email && user.email !== label && (
                <p className="mt-0.5 truncate text-xs text-atlas-current">{user.email}</p>
              )}
            </div>
            <button
              className="flex min-h-10 w-full items-center px-4 py-2 text-left text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TopBar({
  accountUser,
  canQuickCreate,
  helpContent,
  mobile,
  mobileNavigationOpen,
  navigationTriggerRef,
  onCreateTask,
  onLogout,
  onOpenNavigation,
}: {
  accountUser: AccountUser | null;
  canQuickCreate: boolean;
  helpContent?: ReactNode;
  mobile: boolean;
  mobileNavigationOpen: boolean;
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
  onCreateTask: () => void;
  onLogout: () => void;
  onOpenNavigation: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [helpOpen]);

  return (
    <header className="relative z-20 flex min-h-16 items-center justify-between gap-3 border-b border-atlas-mist bg-white px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {mobile && (
          <button
            aria-controls="mobile-navigation"
            aria-expanded={mobileNavigationOpen}
            aria-label="Open navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-atlas-canopy hover:bg-atlas-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-atlas-current"
            onClick={onOpenNavigation}
            ref={navigationTriggerRef}
            type="button"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ☰
            </span>
          </button>
        )}
        <p
          className={clsx(
            mobile
              ? 'truncate font-atlasDisplay text-base font-bold text-atlas-canopy'
              : 'font-atlasMono text-xs font-medium uppercase tracking-[0.14em] text-atlas-current',
          )}
        >
          {mobile ? 'OpenWork Hub' : 'Department task management'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {helpContent && (
          <div className="relative">
            <Button
              aria-expanded={helpOpen}
              aria-haspopup="true"
              onClick={() => setHelpOpen((current) => !current)}
              size="sm"
              variant="ghost"
            >
              Help
            </Button>
            {helpOpen && (
              <div
                aria-label="Help"
                className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-atlas-mist bg-white p-4 text-sm text-atlas-ink shadow-xl"
                role="region"
              >
                {helpContent}
              </div>
            )}
          </div>
        )}
        {canQuickCreate && (
          <Button className="whitespace-nowrap" onClick={onCreateTask} size="sm">
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Create task
          </Button>
        )}
        <AccountMenu onLogout={onLogout} user={accountUser} />
      </div>
    </header>
  );
}

function MobileNavigationSheet({
  activeDepartmentId,
  currentHash,
  currentPath,
  items,
  onClose,
  onNavigate,
  open,
  workspaces,
}: MobileNavigationSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const containFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !sheetRef.current) return;

    const focusableElements = Array.from(
      sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements.at(-1);
    if (!firstFocusable || !lastFocusable) return;

    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        aria-label="Close navigation"
        className="absolute inset-0 bg-atlas-canopy/45 backdrop-blur-[1px]"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label="Navigation"
        aria-modal="true"
        className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-white shadow-2xl"
        id="mobile-navigation"
        onKeyDown={containFocus}
        ref={sheetRef}
        role="dialog"
      >
        <div className="flex min-h-16 items-center justify-between border-b border-atlas-mist px-5">
          <p className="font-atlasDisplay text-lg font-bold text-atlas-canopy">OpenWork Hub</p>
          <button
            aria-label="Close navigation"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-atlas-canopy hover:bg-atlas-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-atlas-current"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
        <PrimaryNavigation
          activeDepartmentId={activeDepartmentId}
          currentHash={currentHash}
          currentPath={currentPath}
          items={items}
          onNavigate={onNavigate}
          workspaces={workspaces}
        />
      </aside>
    </div>
  );
}

export default function AppShell({ helpContent }: AppShellProps) {
  const { logout, membership, user } = useAuth();
  const { data: workspaces = [], isPending: workspacesPending } = useWorkspaces();
  const { workspaceId } = useParams();
  const location = useLocation();
  const mobile = useIsMobile();
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);

  const shellRole = shellRoleFor(membership?.role, workspaces);
  const navigationItems = useMemo(() => navigationForRole(shellRole), [shellRole]);
  const creatableDepartments = creatableQuickTaskDepartments(workspaces, membership?.role);
  const canQuickCreate =
    !workspacesPending && canCreateQuickTask(workspaces, membership?.role);
  const initialQuickTaskDepartmentId = resolveQuickTaskInitialDepartmentId(
    workspaceId,
    creatableDepartments,
  );

  const closeMobileNavigation = useCallback(() => {
    setMobileNavigationOpen(false);
    navigationTriggerRef.current?.focus();
  }, []);
  const closeQuickTask = useCallback(() => setQuickTaskOpen(false), []);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname, mobile]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMobileNavigation();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeMobileNavigation, mobileNavigationOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-atlas-paper text-atlas-ink">
      {!mobile && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-atlas-mist bg-white">
          <div className="flex min-h-16 items-center border-b border-atlas-mist px-5">
            <Link
              className="font-atlasDisplay text-lg font-bold text-atlas-canopy focus-visible:outline focus-visible:outline-2 focus-visible:outline-atlas-current"
              to="/dashboard"
            >
              OpenWork Hub
            </Link>
          </div>
          <PrimaryNavigation
            activeDepartmentId={workspaceId}
            currentHash={location.hash}
            currentPath={location.pathname}
            items={navigationItems}
            workspaces={workspaces}
          />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          accountUser={user}
          canQuickCreate={canQuickCreate}
          helpContent={helpContent}
          mobile={mobile}
          mobileNavigationOpen={mobileNavigationOpen}
          navigationTriggerRef={navigationTriggerRef}
          onCreateTask={() => setQuickTaskOpen(true)}
          onLogout={logout}
          onOpenNavigation={() => setMobileNavigationOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      {mobile && (
        <MobileNavigationSheet
          activeDepartmentId={workspaceId}
          currentHash={location.hash}
          currentPath={location.pathname}
          items={navigationItems}
          onClose={closeMobileNavigation}
          onNavigate={closeMobileNavigation}
          open={mobileNavigationOpen}
          workspaces={workspaces}
        />
      )}
      {quickTaskOpen && (
        <QuickTaskModal
          initialDepartmentId={initialQuickTaskDepartmentId}
          onClose={closeQuickTask}
          open
        />
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}
