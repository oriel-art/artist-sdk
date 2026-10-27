// Studio-only layout; these styles are not imported by the info popup or core.
export const studioStyles = `
  dialog.studio-panel[open] { display:flex; flex-direction:column; overflow:hidden; height:min(900px,calc(100dvh - var(--panel-top) - var(--panel-bottom))); }
  .studio-panel > header { flex:none; padding:22px 26px 18px; position:static; }
  .studio-panel h1 { font-size:32px; }
  .studio-panel > .body { flex:1; min-height:0; overflow:auto; padding:24px 26px; scroll-padding:16px; }
  .editor-footer { flex:none; border-top:1px solid #c8c0b0; background:var(--panel-paper); padding:12px 26px 16px; }
  .editor-footer .actions { margin:8px 0; gap:6px; } .editor-footer button { font-size:11px; padding:8px 10px; }
  .editor-state { font:11px/1.5 monospace; margin:0; color:var(--panel-accent); }
  .editor-footer .status { margin:6px 0 0; min-height:0; font-size:11px; }
  .check-label { display:flex; align-items:center; gap:8px; font:11px/1.5 Verdana,sans-serif; }
  .check-label input[type=checkbox] { margin:0; flex:none; width:16px; height:16px; }
  .report-summary { flex:none; padding:12px 26px; border-bottom:1px solid #c8c0b0; background:#e8e1d2; max-height:27dvh; overflow:auto; }
  .report-summary p { margin:0 0 4px; } .report-total { font:normal 20px/1.25 Georgia,serif; }
  .report-diagnostics { font-size:11px; } .report-summary summary { font:11px/1.5 monospace; overflow-wrap:anywhere; }
  .report-summary details p { margin-top:6px; }
  h3 { font:normal 20px/1.25 Georgia,serif; margin:0 0 10px; }
  .distribution { padding-top:16px; margin-top:16px; } .numeric-summary { font:11px/1.7 monospace; }
  .distribution table { table-layout:fixed; } .distribution th:first-child { width:58%; }
  .distribution th:nth-child(2) { width:20%; } .distribution th:nth-child(3) { width:22%; }
  .distribution th { padding:6px 4px 6px 0; letter-spacing:0; }
  .distribution th button { min-height:36px; padding:4px; border:0; font:10px monospace; }
  .distribution td { padding:10px 4px 10px 0; } .distribution .color-chips,.case-values .color-chips { margin-top:6px; }
  .count-value,.count-share { font:11px/1.6 monospace; }
  .case-values { grid-template-columns:minmax(70px,35%) minmax(0,1fr); gap:6px 12px; margin:12px 0; font-size:12px; }
  .case-values dt { font:11px/1.6 monospace; overflow-wrap:anywhere; color:#656155; }
  .seed-status { font-size:11px; margin:6px 0; color:var(--panel-accent); }
  @media(max-width:540px) {
    .studio-panel > header { padding:16px 20px; } .studio-panel h1 { font-size:28px; }
    .studio-panel > .body { padding:20px; } .editor-footer { padding:10px 20px 12px; }
    .report-summary { padding:10px 20px; } .report-total { font-size:18px; }
  }
`;
