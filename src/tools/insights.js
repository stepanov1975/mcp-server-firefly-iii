const { apiClient } = require("../config.js");

const insightsTools = [
  {
    name: "list_attachments",
    description: "List all files.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => (await apiClient.get("/attachments")).data
  },
  {
    name: "get_attachment",
    description: "Get attachment metadata.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => (await apiClient.get(`/attachments/${args.id}`)).data
  },
  {
    name: "upload_attachment",
    description: "Upload a file and attach it to a Firefly III object (e.g. a transaction). Requires two steps internally: creates the attachment record, then uploads the file content.",
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        attachable_type: { type: "string", description: "e.g. 'TransactionJournal'" },
        attachable_id: { type: "string", description: "ID of the object to attach to" },
        content: { type: "string", description: "Base64-encoded file content" }
      },
      required: ["filename", "attachable_type", "attachable_id", "content"]
    },
    handler: async (args) => {
      const { content, ...meta } = args;
      const createResponse = await apiClient.post("/attachments", meta);
      const attachmentId = createResponse.data?.data?.id;
      if (!attachmentId) throw new Error("Attachment record created but no ID returned.");
      const buffer = Buffer.from(content, "base64");
      await apiClient.post(`/attachments/${attachmentId}/upload`, buffer, {
        headers: { "Content-Type": "application/octet-stream" }
      });
      return { message: "Attachment uploaded successfully.", id: attachmentId };
    }
  },
  {
    name: "delete_attachment",
    description: "Delete an attachment.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await apiClient.delete(`/attachments/${args.id}`);
      return { message: "Attachment deleted successfully." };
    }
  },
  {
    name: "get_account_overview_chart",
    description: "Get balance trend charts.",
    inputSchema: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
    handler: async (args) => (await apiClient.get("/charts/account/overview", { params: { start: args.start, end: args.end } })).data
  },
  {
    name: "get_net_worth_summary",
    description: "Get pre-calculated net worth summary over time.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "YYYY-MM-DD" },
        end: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["start", "end"]
    },
    handler: async (args) => (await apiClient.get("/summary/basic", { params: { start: args.start, end: args.end } })).data
  },
  {
    name: "get_spending_summary",
    description: "Get expense totals per category for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "YYYY-MM-DD" },
        end: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["start", "end"]
    },
    handler: async (args) => (await apiClient.get("/insight/expense/category", { params: { start: args.start, end: args.end } })).data
  }
];

module.exports = insightsTools;
