declare const app: import("fastify").FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault> & PromiseLike<import("fastify").FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>> & {
    __linterBrands: "SafePromiseLike";
};
declare const document: ReturnType<typeof app.swagger> & {
    paths: Record<string, {
        post?: {
            requestBody?: unknown;
            responses?: Record<string, unknown>;
        };
    }>;
};
export { document };
//# sourceMappingURL=openapi-document.d.ts.map