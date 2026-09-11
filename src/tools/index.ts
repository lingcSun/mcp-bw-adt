/** Aggregate of all tool groups. Add new groups here. */
import { systemTools } from "./system"
import { searchTools } from "./search"
import { dataflowTools } from "./dataflow"
import { genericTools } from "./generic"
import { adsoTools } from "./adso"
import { areaTools } from "./area"
import { transformationTools } from "./transformation"
import { dtpTools } from "./dtp"
import { datasourceTools } from "./datasource"
import { replicationTools } from "./replication"
import { processChainTools } from "./processchain"
import { infoobjectTools } from "./infoobject"
import { ddicTools } from "./ddic"
import { reportingTools } from "./reporting"
import { transportTools } from "./transport"

export const ALL_TOOLS = [
  ...systemTools,
  ...searchTools,
  ...dataflowTools,
  ...genericTools,
  ...adsoTools,
  ...areaTools,
  ...transformationTools,
  ...dtpTools,
  ...datasourceTools,
  ...replicationTools,
  ...processChainTools,
  ...infoobjectTools,
  ...ddicTools,
  ...reportingTools,
  ...transportTools,
]
