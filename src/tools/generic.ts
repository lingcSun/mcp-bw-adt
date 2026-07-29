/**
 * Generic cross-type BW object CRUD tools (createObject/updateObject/deleteObject/
 * activateObject). These work across ADSO / TRFN / DTPA / ProcessChain / InfoObject /
 * InfoArea using a type discriminator.
 *
 * createObject("trfn") throws server-side, so we short-circuit with a clear error.
 * deleteObject's third arg is a lock handle for InfoArea, a transport request for others.
 */
import { z } from "zod"
import { defineTool, largeInput, outputPathField, readLargeInput } from "../tool"

const OBJECT_TYPE = z
  .enum(["adso", "trfn", "dtpa", "pc", "iobj", "area"])
  .describe(
    "BW object type. Note: trfn creation is unsupported server-side and will error."
  )

export const genericTools = [
  defineTool({
    name: "bw_object_create",
    description:
      "Create any BW object from raw XML (ADSO/DTPA/ProcessChain/InfoObject/InfoArea). " +
      "XML via xmlContent or xmlPath. " +
      "⚠️ Transformation (trfn) creation is NOT supported (server-side limitation) and will return an error. " +
      "For ADSO, prefer the higher-level bw_adso_create.",
    params: z.object({
      objectType: OBJECT_TYPE,
      objectName: z.string(),
      ...largeInput("xml"),
      parent: z.string().optional(),
      transport: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { objectType, objectName, parent, transport } = args
      if (objectType === "trfn") {
        throw new Error(
          "Transformation (trfn) creation is not supported by the BW ADT API. " +
            "Create the transformation in BW Modeling Tools / Eclipse, then use " +
            "bw_trfn_* tools to read, update, map rules, and maintain routines."
        )
      }
      const xml = await readLargeInput(args, "xml", true)
      return client.createObject(objectType, objectName, xml!, {
        parent,
        transport,
      })
    },
  }),

  defineTool({
    name: "bw_object_update",
    description:
      "Update any BW object from raw XML. XML via xmlContent or xmlPath. " +
      "lockHandle optional (some object types require it). Prefer the type-specific save_and_activate tools.",
    params: z.object({
      objectType: OBJECT_TYPE,
      objectName: z.string(),
      ...largeInput("xml"),
      lockHandle: z.string().optional(),
      transport: z.string().optional(),
      outputPath: outputPathField,
    }),
    async run(client, args) {
      const { objectType, objectName, lockHandle, transport } = args
      const xml = await readLargeInput(args, "xml", true)
      return client.updateObject(objectType, objectName, xml!, {
        lockHandle,
        transport,
      })
    },
  }),

  defineTool({
    name: "bw_object_delete",
    description:
      "Delete any BW object. Irreversible. " +
      "For InfoArea (area), pass a lockHandle from bw_adso_lock-equivalent; " +
      "for other types, pass a transport request number.",
    params: z.object({
      objectType: OBJECT_TYPE,
      objectName: z.string(),
      lockHandleOrTransport: z
        .string()
        .describe("Lock handle (InfoArea) or transport request number (other types)."),
    }),
    async run(client, args) {
      return client.deleteObject(args.objectType, args.objectName, args.lockHandleOrTransport)
    },
  }),

  defineTool({
    name: "bw_object_activate",
    description:
      "Activate any object by URI. version controls active vs inactive variant.",
    params: z.object({
      objectUri: z.string().describe("Object URI to activate."),
      lockHandle: z.string().describe("Lock handle."),
      version: z
        .enum(["active", "inactive"])
        .optional()
        .describe("Which variant to activate."),
    }),
    async run(client, args) {
      return client.activateObject(args.objectUri, args.lockHandle, args.version)
    },
  }),
]
