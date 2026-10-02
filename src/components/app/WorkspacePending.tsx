/** Only used when a route is genuinely slow; cached screens remain immediate. */
export function WorkspacePending() {
  return <div className="qs-workspace-pending" role="status" aria-label="Loading workspace">
    <div className="qs-boot-mark" aria-hidden="true" />
    <span>QuickServe</span>
  </div>;
}
