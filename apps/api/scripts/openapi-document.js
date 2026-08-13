import { SessionImportBatchOutcomeSchema, SessionUploadCandidateListSchema, SessionUploadCandidateRequestSchema, } from "@intenttrace/schema";
import { buildApp } from "../src/app.js";
const app = buildApp({ version: "0.0.0", gitCommit: "generated" });
await app.ready();
const document = app.swagger();
const vendor = "application/vnd.intenttrace.session-bundle";
const framedSchema = {
    type: "string",
    contentMediaType: vendor,
    description: "ITB1 framed session bundle bytes",
};
const candidateOperation = document.paths?.["/api/v1/imports/candidates"]?.post;
if (candidateOperation) {
    candidateOperation.requestBody = {
        required: true,
        content: {
            "application/json": { schema: SessionUploadCandidateRequestSchema.toJSONSchema() },
            [vendor]: { schema: framedSchema },
        },
    };
    candidateOperation.responses = {
        ...candidateOperation.responses,
        200: {
            description: "Candidate inspection",
            content: {
                "application/json": { schema: SessionUploadCandidateListSchema.toJSONSchema() },
            },
        },
    };
}
const sessionOperation = document.paths?.["/api/v1/imports/sessions"]?.post;
if (sessionOperation) {
    sessionOperation.requestBody = {
        required: true,
        content: { [vendor]: { schema: framedSchema } },
    };
    sessionOperation.responses = {
        ...sessionOperation.responses,
        200: {
            description: "Batch import outcome",
            content: {
                "application/json": { schema: SessionImportBatchOutcomeSchema.toJSONSchema() },
            },
        },
    };
}
await app.close();
export { document };
