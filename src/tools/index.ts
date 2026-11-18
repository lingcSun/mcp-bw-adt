/** Aggregate of all tool groups. Add new groups here. */
import { systemTools } from "./system"
import { dumpsTools } from "./dumps"
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
import { hcprTools } from "./hcpr"

export const ALL_TOOLS = [
  ...systemTools,
  ...dumpsTools,
  ...searchTools,
  ...dataflowTools,
  ...genericTools,
  ...adsoTools,
  ...areaTools,
  ...hcprTools,
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
