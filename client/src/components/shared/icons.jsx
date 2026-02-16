// Shared icon components used across CategoryList components

export const ChevronIcon = ({ expanded }) => (
  <svg
    className={`category-toggle ${expanded ? '' : 'collapsed'}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const DragIcon = () => (
  <svg className="task-drag-handle" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

export const PlusIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

// Show Tasks icon - box with arrow pointing out
export const OpenBoxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6" />
    <path d="M15 3h6v6" />
    <path d="M21 3l-9 9" />
  </svg>
);

// Copy ID icon - clipboard with # symbol
export const CopyIdIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="4" width="12" height="16" rx="2" />
    <path d="M4 8h2v12a2 2 0 002 2h8" />
    <text x="14" y="15" fill="currentColor" stroke="none" fontSize="9" fontWeight="700" textAnchor="middle">#</text>
  </svg>
);

// Plan icon - notepad with pencil
export const PlanIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h5" />
  </svg>
);

// Implement icon - anvil
export const ImplementIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h20" />
    <path d="M4 12c0-4 3-7 8-7h8" />
    <path d="M6 12v4h12v-4" />
    <path d="M8 16v3h8v-3" />
  </svg>
);

// Breakdown icon - tree hierarchy
export const BreakdownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="2" width="6" height="5" rx="1" />
    <rect x="2" y="17" width="6" height="5" rx="1" />
    <rect x="9" y="17" width="6" height="5" rx="1" />
    <rect x="16" y="17" width="6" height="5" rx="1" />
    <path d="M12 7v4M5 17v-3h14v3M12 14v3" />
  </svg>
);
