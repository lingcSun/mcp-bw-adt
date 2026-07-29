/**
 * Tools that mutate BW state (create / update / delete / lock / activate /
 * execute / replicate / transport create, …). Blocked when the current
 * environment profile has readOnly=true.
 */
export const MUTATING_TOOLS = new Set<string>([
  // Generic CRUD
  "bw_object_create",
  "bw_object_update",
  "bw_object_delete",
  "bw_object_activate",

  // ADSO
  "bw_adso_lock",
  "bw_adso_unlock",
  "bw_adso_activate",
  "bw_adso_update",
  "bw_adso_save_and_activate",
  "bw_adso_add_field",
  "bw_adso_create",

  // Transformation
  "bw_trfn_lock",
  "bw_trfn_unlock",
  "bw_trfn_activate",
  "bw_trfn_update",
  "bw_trfn_save_and_activate",
  "bw_trfn_set_end_routine_fields",
  "bw_trfn_add_rules_and_save",
  "bw_trfn_auto_map_and_save",
  "bw_trfn_switch_runtime",
  "bw_trfn_class_save_source",
  "bw_trfn_class_update_source",
  "bw_trfn_class_lock",
  "bw_trfn_class_unlock",

  // DTP
  "bw_dtp_lock",
  "bw_dtp_unlock",
  "bw_dtp_activate",
  "bw_dtp_execute",
  "bw_dtp_update",
  "bw_dtp_save_and_activate",

  // DataSource
  "bw_datasource_lock",
  "bw_datasource_unlock",
  "bw_datasource_update",
  "bw_datasource_activate",
  "bw_datasource_merge_proposal",
  "bw_datasource_save_and_activate",

  // Replication
  "bw_replication_replicate",
  "bw_replication_replicate_full",

  // Process chain
  "bw_processchain_lock",
  "bw_processchain_unlock",
  "bw_processchain_activate",
  "bw_processchain_execute",
  "bw_processchain_stop",

  // Reporting (updates server-side view state)
  "bw_reporting_update_view",

  // Transport
  "bw_transport_create",
])

export function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name)
}
