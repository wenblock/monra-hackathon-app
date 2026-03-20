export const recipientsKeys = {
  all: ["recipients"] as const,
  list: (userId: string) => [...recipientsKeys.all, userId, "list"] as const,
};
