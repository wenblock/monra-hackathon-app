export const transactionsKeys = {
  all: ["transactions"] as const,
  list: (userId: string, limit: number) =>
    [...transactionsKeys.all, userId, "list", limit] as const,
  history: (userId: string) => [...transactionsKeys.all, userId, "history"] as const,
};
